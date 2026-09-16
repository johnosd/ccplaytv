// Copia o build de produção (tv-web/dist) para o projeto Tizen (../CCPlayTv),
// sem tocar nos arquivos de metadata do Tizen (config.xml, .project,
// .tproject, tizen_web_project.yaml, icon.png). Rodar depois de `vite build`.
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.resolve(here, '..', 'dist')
const tizenDir = path.resolve(here, '..', '..', 'CCPlayTv')

if (!existsSync(distDir)) {
  console.error('tv-web/dist não existe — rode "npm run build" antes de sincronizar.')
  process.exit(1)
}
if (!existsSync(tizenDir)) {
  console.error(`Projeto Tizen não encontrado em ${tizenDir}`)
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
