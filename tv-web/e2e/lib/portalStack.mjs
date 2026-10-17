// Pilha local do portal: emulador Firestore + API real (journal em memória) + portal-web + TV (vite --mode commercial,
// proxy same-origin para a API). Usada por `npm run dev:portal` e pelos E2E de portal. Não prova DUID real, AVPlay,
// IAM/Scheduler/Cloud Storage nem pagamento. Chaves em memória por execução; nunca em disco nem em log.
import assert from 'node:assert/strict'
import { execSync, spawn } from 'node:child_process'
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..', '..', '..')
const b64 = () => randomBytes(32).toString('base64url')

export function listening(port) {
  return new Promise(done => { const socket = connect(port, '127.0.0.1'); socket.once('connect', () => { socket.destroy(); done(true) }); socket.once('error', () => done(false)) })
}
async function waitFor(check, label, ms = 60000) {
  const limit = Date.now() + ms
  while (Date.now() < limit) { if (await check()) return; await new Promise(r => setTimeout(r, 400)) }
  throw new Error(`timeout: ${label}`)
}

// As portas podem ser trocadas por E2E_TV_PORT / E2E_PORTAL_PORT / E2E_API_PORT / E2E_EMULATOR_PORT (ex.: com `npm run dev:portal` já no ar).
const envPort = (name, fallback) => Number(process.env[name] ?? fallback)
export async function startPortalStack({ log = () => {}, tvPort = envPort('E2E_TV_PORT', 5176), portalPort = envPort('E2E_PORTAL_PORT', 5174), apiPort = envPort('E2E_API_PORT', 3001), emulatorPort = envPort('E2E_EMULATOR_PORT', 8085), devDuid = 'dev-portal-' + b64().slice(0, 12) } = {}) {
  const children = []
  const start = (label, command, args, options) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...options })
    child.output = ''
    // Sem códigos de cor: com FORCE_COLOR/terminal colorido o Vite imprime a porta em negrito e o `includes` abaixo falharia.
    const keep = chunk => { child.output = (child.output + String(chunk).replace(/\x1b\[[0-9;]*m/g, '')).slice(-4000) }
    child.stdout.on('data', keep); child.stderr.on('data', keep)
    child.once('exit', code => { child.exited = code ?? -1 })
    children.push({ label, child })
    return child
  }
  const stop = () => {
    for (const { child } of children) {
      if (child.exited !== undefined || !child.pid) continue
      try { execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }) } catch { /* já encerrado */ }
    }
  }
  const tvOrigin = `http://127.0.0.1:${tvPort}`, portalOrigin = `http://127.0.0.1:${portalPort}`, apiOrigin = `http://127.0.0.1:${apiPort}`
  try {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const signingPem = privateKey.export({ type: 'pkcs8', format: 'pem' })
    const publicJwk = createPublicKey(createPrivateKey(signingPem)).export({ format: 'jwk' })

    const sdk = execSync('gcloud info --format="value(installation.sdk_root)"', { shell: true, encoding: 'utf8' }).trim()
    const emulatorCmd = join(sdk, 'platform', 'cloud-firestore-emulator', 'cloud_firestore_emulator.cmd')
    for (const [name, port] of [['emulador', emulatorPort], ['api', apiPort], ['portal-web', portalPort], ['tv', tvPort]]) {
      assert.equal(await listening(port), false, `porta ${port} (${name}) já em uso: encerre o processo antigo (estado limpo é requisito)`)
    }
    // O emulador atual exige Java 21+; o launcher usa o `java` do PATH. Prioriza CCPLAY_EMULATOR_JAVA_HOME (padrão:
    // JAVA_HOME) apenas no processo filho, sem alterar a configuração da máquina.
    const javaHome = process.env.CCPLAY_EMULATOR_JAVA_HOME ?? process.env.JAVA_HOME
    const emulatorEnv = javaHome ? { ...process.env, PATH: `${join(javaHome, 'bin')};${process.env.PATH}` } : process.env
    log('subindo emulador Firestore')
    start('emulador', 'cmd.exe', ['/c', emulatorCmd, 'start', '--host=127.0.0.1', `--port=${emulatorPort}`], { cwd: root, env: emulatorEnv })
    await waitFor(() => listening(emulatorPort), 'emulador Firestore', 90000)

    log('subindo API do portal (development + emulador, journal em memória)')
    const api = start('api', join(root, 'api', '.venv', 'Scripts', 'python.exe'), [join(root, 'infra', 'portal', 'dev', 'local_portal.py')], {
      cwd: join(root, 'api'),
      env: { ...process.env, CCPLAY_PORTAL_ENVIRONMENT: 'development', FIRESTORE_EMULATOR_HOST: `127.0.0.1:${emulatorPort}`,
        PORT: String(apiPort), CCPLAY_PORTAL_PUBLIC_ORIGIN: portalOrigin, CCPLAY_PORTAL_AES_KEY: b64(),
        CCPLAY_PORTAL_SIGNING_KEY: signingPem, CCPLAY_PORTAL_IDENTITY_HMAC_KEY: b64(), CCPLAY_PORTAL_RECOVERY_HMAC_KEY: b64(),
        CCPLAY_PORTAL_SERVICE_RECOVERY_EPOCH: b64() },
    })
    await waitFor(async () => { if (api.exited !== undefined) throw new Error('api encerrou: ' + api.output); try { return (await fetch(apiOrigin + '/health')).ok } catch { return false } }, 'API /health')

    log('subindo portal-web e TV (commercial, proxy same-origin)')
    const portal = start('portal-web', process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(portalPort), '--strictPort'], { cwd: join(root, 'portal-web'), env: { ...process.env, PORTAL_API_ORIGIN: apiOrigin } })
    const tv = start('tv-web', process.execPath, ['node_modules/vite/bin/vite.js', '--mode', 'commercial', '--host', '127.0.0.1', '--port', String(tvPort), '--strictPort'], {
      cwd: join(root, 'tv-web'),
      env: { ...process.env, VITE_PORTAL_ORIGIN: tvOrigin, VITE_PORTAL_DEV_PROXY: apiOrigin, VITE_PORTAL_DEV_DUID: devDuid,
        VITE_PORTAL_SITE_URL: portalOrigin,
        VITE_LICENSE_PUBLIC_KEYS: JSON.stringify({ v1: publicJwk }) },
    })
    await waitFor(() => portal.output.includes(portalOrigin) || portal.exited !== undefined, 'vite portal-web')
    await waitFor(() => tv.output.includes(tvOrigin) || tv.exited !== undefined, 'vite tv-web')
  } catch (error) {
    const tails = children.map(({ label, child }) => `--- ${label}\n${child.output.slice(-600)}`).join('\n')
    stop()
    error.message += '\n' + tails
    throw error
  }
  return { tvOrigin, portalOrigin, apiOrigin, devDuid, children, stop }
}
