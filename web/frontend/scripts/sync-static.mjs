import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const distDir = resolve(root, 'dist')
const targetDir = resolve(root, '../backend/app/static')

if (!existsSync(distDir)) {
  console.error(`No dist directory found at ${distDir}. Did you run "npm run build" first?`)
  process.exit(1)
}

if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true })
}

mkdirSync(targetDir, { recursive: true })

cpSync(distDir, targetDir, { recursive: true })

console.log(`Synced ${distDir} -> ${targetDir}`)
