// Copia o build de produção (tv-web/dist) para o projeto Tizen (../CCPlayTv),
// sem tocar nos arquivos de metadata do Tizen (config.xml, .project,
// .tproject, tizen_web_project.yaml, icon.png). Rodar depois de `vite build`.
import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findUnlistedFiles } from './tizenFiles.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(here, '..', 'dist')
const tizenDir = path.resolve(here, '..', '..', 'CCPlayTv')
const yamlPath = path.join(tizenDir, 'tizen_web_project.yaml')

if (!existsSync(distDir)) {
  console.error('tv-web/dist não existe — rode "npm run build" antes de sincronizar.')
  process.exit(1)
}
if (!existsSync(tizenDir)) {
  console.error(`Projeto Tizen não encontrado em ${tizenDir}`)
  process.exit(1)
}

/** Caminhos de `dir`, relativos a `dir`, sempre com `/` (mesma forma do YAML). */
async function listFilesRecursive(dir, base = dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(full, base)))
    } else {
      out.push(path.relative(base, full).replace(/\\/g, '/'))
    }
  }
  return out
}

// Guarda do pacote (feature 021, D-009): um arquivo que o build emite e não
// está em `files:` só falha na TV, nunca no navegador nem nos testes — por
// isso é verificado aqui, antes de copiar, e não descoberto depois.
const distFiles = await listFilesRecursive(distDir)
const yamlText = readFileSync(yamlPath, 'utf8')
const unlisted = findUnlistedFiles(distFiles, yamlText)
if (unlisted.length > 0) {
  console.error('Arquivo(s) do build fora de `files:` em tizen_web_project.yaml — adicione antes de sincronizar:')
  for (const file of unlisted) console.error(`  - ${file}`)
  process.exit(1)
}

async function copyDirFlat(srcDir, destDir) {
  await mkdir(destDir, { recursive: true })
  for (const entry of await readdir(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirFlat(srcPath, destPath)
    } else {
      await copyFile(srcPath, destPath)
    }
  }
}

// Remove só os artefatos web da build anterior, nunca a metadata do Tizen.
await rm(path.join(tizenDir, 'assets'), { recursive: true, force: true })

await copyDirFlat(distDir, tizenDir)

console.log(`Sincronizado: ${distDir} -> ${tizenDir}`)
