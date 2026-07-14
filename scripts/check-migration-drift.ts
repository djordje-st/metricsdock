import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'

const migrationsPath = 'src/db/migrations'
const tempBase = join(process.cwd(), 'node_modules/.cache')

mkdirSync(tempBase, { recursive: true })

const tempRoot = mkdtempSync(join(tempBase, 'metricsdock-migrations-'))
const tempMigrationsPath = join(tempRoot, 'migrations')
const tempConfigPath = join(tempRoot, 'drizzle.config.ts')

try {
  cpSync(migrationsPath, tempMigrationsPath, { recursive: true })
  writeFileSync(
    tempConfigPath,
    [
      "import { defineConfig } from 'drizzle-kit'",
      '',
      'export default defineConfig({',
      `  out: ${JSON.stringify(relative(process.cwd(), tempMigrationsPath))},`,
      "  schema: 'src/db/schema.ts',",
      "  dialect: 'postgresql',",
      '  dbCredentials: {',
      `    url: process.env.DATABASE_URL ?? 'postgres://metricsdock:metricsdock@localhost:5432/metricsdock',`,
      '  },',
      '})',
      '',
    ].join('\n'),
  )
  const before = snapshotDirectory(tempMigrationsPath)
  const result = spawnSync(
    'pnpm',
    ['exec', 'drizzle-kit', 'generate', '--config', tempConfigPath],
    {
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgres://metricsdock:metricsdock@localhost:5432/metricsdock',
      },
    },
  )
  const output = `${result.stdout}${result.stderr}`

  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }

  if (output.includes('Error:')) {
    process.exit(1)
  }

  const after = snapshotDirectory(tempMigrationsPath)
  const drift = changedFiles(before, after)

  if (drift.length > 0) {
    console.error(
      [
        'Drizzle migration drift detected. Run pnpm db:generate and review the generated migration files.',
        ...drift.map((file) => `- ${file}`),
      ].join('\n'),
    )
    process.exit(1)
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

function snapshotDirectory(root: string) {
  const files = new Map<string, string>()

  for (const file of listFiles(root)) {
    files.set(relative(root, file), readFileSync(file, 'utf8'))
  }

  return files
}

function listFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const file = join(root, entry)
      const stat = statSync(file)

      return stat.isDirectory() ? listFiles(file) : [file]
    })
    .sort()
}

function changedFiles(before: Map<string, string>, after: Map<string, string>) {
  const files = new Set([...before.keys(), ...after.keys()])

  return [...files]
    .filter((file) => before.get(file) !== after.get(file))
    .sort()
}
