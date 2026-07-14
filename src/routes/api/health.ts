import { createFileRoute } from '@tanstack/react-router'
import { sql } from 'drizzle-orm'
import { db } from '#/db/index.server.ts'
import { addWideLogContext, serializeError } from '#/lib/logging.server.ts'
import { getSyncQueue } from '#/server/queue.server.ts'

const requiredEnv = [
  'DATABASE_URL',
  'BETTER_AUTH_URL',
  'BETTER_AUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'ENCRYPTION_KEY',
  'CRON_SECRET',
] as const

const queueHealthTimeoutMs = 2_000

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const missing = requiredEnv.filter((key) => !process.env[key])

          if (missing.length) {
            throw new Error(`Missing required env vars: ${missing.join(', ')}`)
          }

          if (process.env.BETTER_AUTH_SECRET!.length < 32) {
            throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
          }

          await db.execute(sql`select 1`)
          const queueStatus = await checkQueueHealth()

          return Response.json({
            ok: true,
            database: 'ok',
            queue: queueStatus,
          })
        } catch (error) {
          addWideLogContext({
            health_ok: false,
            error: serializeError(error),
          })

          return Response.json(
            {
              ok: false,
              error: 'Health check failed',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})

async function checkQueueHealth() {
  if (!process.env.VALKEY_URL) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing required env vars: VALKEY_URL')
    }

    return 'missing'
  }

  await withTimeout(
    getSyncQueue().getJobCounts('waiting'),
    queueHealthTimeoutMs,
    'Queue health check timed out',
  )

  return 'ok'
}

async function withTimeout<TValue>(
  promise: Promise<TValue>,
  timeoutMs: number,
  message: string,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<TValue>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}
