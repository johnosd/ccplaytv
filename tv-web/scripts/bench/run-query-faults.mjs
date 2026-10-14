import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const result = spawnSync('npm', ['run', 'test', '--', 'src/lib/metadata/queryFaults.test.ts', '--reporter=dot'], {
  cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
  encoding: 'utf8',
  windowsHide: true,
  shell: process.platform === 'win32',
})
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(JSON.stringify({ runner: 'query-faults', status: 'pass', output: 'agregado; sem URLs ou credenciais' }))
