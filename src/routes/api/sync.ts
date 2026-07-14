import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { addWideLogContext } from '#/lib/logging.server.ts'
import { enqueueSync } from '#/server/queue.server.ts'
import { requireOrganizationContext } from '#/server/auth.server.ts'
import { enqueueDueScheduledSyncs } from '#/server/sync.server.ts'

const syncInput = z
  .object({
    appId: z.string().trim().min(1).optional(),
  })
  .default({})

const manualSyncWindowMs = 60_000
const manualSyncMaxRequests = 10
const manualSyncRateLimits = new Map<
  string,
  { count: number; resetsAt: number }
>()

export const Route = createFileRoute('/api/sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env.CRON_SECRET) {
          return Response.json(
            { ok: false, error: 'CRON_SECRET is required' },
            { status: 500 },
          )
        }

        const bearer = request.headers
          .get('authorization')
          ?.replace('Bearer ', '')
        const cronSecret = request.headers.get('x-cron-secret') ?? bearer

        if (cronSecret === process.env.CRON_SECRET) {
          const jobs = await enqueueDueScheduledSyncs()
          addWideLogContext({
            sync_trigger: 'cron',
            sync_jobs_queued: jobs.length,
          })

          return Response.json({
            ok: true,
            queued: jobs.length,
            jobIds: jobs.map((job) => job.id),
          })
        }

        if (!isSameOriginRequest(request)) {
          return Response.json(
            { ok: false, error: 'Forbidden' },
            { status: 403 },
          )
        }

        const context = await requireOrganizationContext(request).catch(
          () => null,
        )

        if (!context) {
          return Response.json(
            { ok: false, error: 'Unauthorized' },
            { status: 401 },
          )
        }

        if (!consumeManualSyncLimit(context.organizationId, context.user.id)) {
          addWideLogContext({ sync_trigger: 'manual', rate_limited: true })

          return Response.json(
            { ok: false, error: 'Too many sync requests' },
            { status: 429 },
          )
        }

        const body = await request.json().catch(() => ({}))
        const data = syncInput.parse(body)
        const job = await enqueueSync({
          userId: context.user.id,
          authOrganizationId: context.organizationId,
          appId: data.appId,
          reason: 'manual',
        })
        addWideLogContext({
          sync_trigger: 'manual',
          sync_target_app_id: data.appId,
          sync_job_id: job.id,
        })

        return Response.json({ ok: true, jobId: job.id })
      },
    },
  },
})

function isSameOriginRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false

  try {
    return origin === new URL(process.env.BETTER_AUTH_URL ?? '').origin
  } catch {
    return false
  }
}

function consumeManualSyncLimit(organizationId: string, userId: string) {
  const now = Date.now()
  const key = `${organizationId}:${userId}`
  const bucket = manualSyncRateLimits.get(key)

  if (!bucket || bucket.resetsAt <= now) {
    manualSyncRateLimits.set(key, {
      count: 1,
      resetsAt: now + manualSyncWindowMs,
    })
    return true
  }

  if (bucket.count >= manualSyncMaxRequests) return false

  bucket.count += 1
  return true
}
