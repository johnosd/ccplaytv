// `npm run dev:portal`: sobe TUDO de uma vez (emulador Firestore + API local + site + TV em modo comercial), abre a TV
// e o site no navegador e fica rodando até o Ctrl+C. Uso manual no PC; dados somem ao encerrar.
//
//   npm run dev:portal                 # sobe e abre as duas abas
//   $env:NO_BROWSER='1'; npm run dev:portal   # não abre o navegador
//   $env:TV_PORT='5175'; npm run dev:portal   # outra porta para a TV (padrão 5173, a do `npm run dev`)
//
// Cuida sozinho de: Java do emulador (usa o do Android Studio se JAVA_HOME não estiver definido) e de processos
// antigos desta pilha que sobraram nas portas (só os que são vite/emulador/API local, nunca outro programa).
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { listening, startPortalStack } from '../e2e/lib/portalStack.mjs'

const TV_PORT = Number(process.env.TV_PORT ?? 5173)
const PORTS = [TV_PORT, 5174, 3001, 8085]
const OURS = /vite|firestore|local_portal/i

const say = message => console.log('›', message)

/** Encerra o que sobrou de uma execução anterior nas portas da pilha — só se for da pilha. */
function freeStalePorts() {
  for (const port of PORTS) {
    let pids = []
    try {
      const out = execSync(`netstat -ano -p tcp`, { encoding: 'utf8' })
      pids = [...new Set(out.split(/\r?\n/).filter(line => /LISTENING/.test(line) && new RegExp(`[:\\]]${port}\\s`).test(line))
        .map(line => line.trim().split(/\s+/).pop()).filter(pid => /^\d+$/.test(pid) && pid !== '0'))]
    } catch { /* sem netstat: o assert da pilha acusa a porta */ }
    for (const pid of pids) {
      let command = ''
      try {
        command = execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { encoding: 'utf8' })
      } catch { /* processo já saiu */ }
      if (OURS.test(command)) {
        say(`encerrando processo antigo da pilha na porta ${port} (pid ${pid})`)
        try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }) } catch { /* já encerrado */ }
      }
    }
  }
}

// O emulador atual exige Java 21+. Sem JAVA_HOME, tenta o JBR do Android Studio (já instalado nesta máquina).
if (!process.env.CCPLAY_EMULATOR_JAVA_HOME && !process.env.JAVA_HOME) {
  const jbr = 'C:\\Program Files\\Android\\Android Studio\\jbr'
  if (existsSync(jbr)) { process.env.CCPLAY_EMULATOR_JAVA_HOME = jbr; say('Java: Android Studio JBR') }
}

freeStalePorts()
await new Promise(resolve => setTimeout(resolve, 800))

let stack
try {
  stack = await startPortalStack({ log: say, tvPort: TV_PORT })
} catch (error) {
  console.error('\nA pilha não subiu:\n' + String(error.message ?? error))
  process.exit(1)
}

console.log(`
  ┌─ Tudo no ar ─────────────────────────────────────────────────────────────
  │  TV (app, modo comercial):  ${stack.tvOrigin}
  │  Site (portal-web):         ${stack.portalOrigin}
  │  API local (emulador):      ${stack.apiOrigin}
  │  Identidade de dev (DUID):  ${stack.devDuid}
  └──────────────────────────────────────────────────────────────────────────
  Como testar:
   1. Na TV, "Adicionar lista" abre na aba "Pelo site" (ID, chave e QR); Xtream Codes e Lista M3U são as outras abas.
   2. No site, entre com o ID e a chave mostrados na TV, cadastre a lista e volte à TV → "Recarregar".
   3. Na TV, adicione/exclua uma lista e veja no site (o envio é no ato; o site consulta sozinho a cada ~10 s).
  Teclado na TV: setas, Enter = OK, Esc = RETURN. Ctrl+C encerra tudo e apaga os dados.
`)

if (!process.env.NO_BROWSER) {
  for (const url of [stack.tvOrigin, stack.portalOrigin]) {
    try { spawn('cmd.exe', ['/c', 'start', '""', url], { stdio: 'ignore', detached: true, windowsHide: true }).unref() } catch { /* abre à mão */ }
  }
}

const shutdown = () => { stack.stop(); process.exit(0) }
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
// Se algum serviço da pilha cair, avisa em vez de ficar parado achando que está tudo no ar.
setInterval(() => {
  const dead = stack.children.filter(({ child }) => child.exited !== undefined)
  if (dead.length) {
    console.error('Serviço encerrou: ' + dead.map(({ label }) => label).join(', ') + '. Encerrando a pilha.')
    shutdown()
  }
}, 3000)
void listening
await new Promise(() => {})
