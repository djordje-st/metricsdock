import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

const routeTreePath = 'src/routeTree.gen.ts'
const before = readFileSync(routeTreePath, 'utf8')
const result = spawnSync('pnpm', ['generate-routes'], { stdio: 'inherit' })
await setTimeout(50)
const after = readFileSync(routeTreePath, 'utf8')

if (after !== before) {
  writeFileSync(routeTreePath, before)
  console.error(
    `${routeTreePath} is out of date. Run pnpm generate-routes and commit the generated file.`,
  )
  process.exit(1)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
