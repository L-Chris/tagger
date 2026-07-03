import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const result = spawnSync('codegraph', ['sync', root], {
  cwd: root,
  shell: process.platform === 'win32',
  stdio: 'inherit',
})

if (result.error) {
  console.warn(`[codegraph] sync skipped: ${result.error.message}`)
  process.exit(0)
}

if (result.status !== 0) {
  console.warn(`[codegraph] sync exited with code ${result.status}`)
}

process.exit(0)
