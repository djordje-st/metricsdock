import { Worker } from 'bullmq'
import {
  ensureSyncScheduler,
  getQueueConnection,
  SYNC_INTERVAL_MINUTES,
  SYNC_SCHEDULER_CRON,
} from '#/server/queue.server.ts'
import type { SyncJobData, SyncJobName } from '#/server/queue.server.ts'
import { enqueueDueScheduledSyncs, runSyncJob } from '#/server/sync.server.ts'
import {
  addWideLogContext,
  createWideLogEvent,
  emitWideLogEvent,
  runWithWideLogEvent,
  serializeError,
} from '#/lib/logging.server.ts'
import type { WideLogEvent } from '#/lib/logging.server.ts'
import { config } from 'dotenv'

config({ path: ['.env.local', '.env'], quiet: true })

try {
  await ensureSyncScheduler()
} catch (error) {
  emitWideLogEvent(['worker'], {
    ...createWideLogEvent({
      eventName: 'sync_scheduler_setup',
      service: 'worker',
    }),
    outcome: 'error',
    error: serializeError(error),
  })
  throw error
}

const worker = new Worker<SyncJobData, void, SyncJobName>(
  'sync',
  async (job) => {
    const start = performance.now()
    const event: WideLogEvent = {
      ...createWideLogEvent({ eventName: 'sync_job', service: 'worker' }),
      queue_name: 'sync',
      job_id: job.id,
      job_name: job.name,
      job_attempts_made: job.attemptsMade,
      sync_reason: job.data.reason,
      sync_target_user_id: job.data.userId,
      sync_target_organization_id: job.data.authOrganizationId,
      sync_target_connection_id: job.data.connectionId,
      sync_target_app_id: job.data.appId,
    }

    return runWithWideLogEvent(event, async () => {
      try {
        if (job.name === 'sync-scheduler') {
          const jobs = await enqueueDueScheduledSyncs()
          addWideLogContext({ sync_jobs_queued: jobs.length })
        } else {
          await runSyncJob(job.data, job.id)
        }

        event.outcome = 'success'
      } catch (error) {
        event.outcome = 'error'
        event.error = serializeError(error)
        throw error
      } finally {
        event.duration_ms = Math.round(performance.now() - start)
        emitWideLogEvent(['worker'], event)
      }
    })
  },
  {
    connection: getQueueConnection(),
    prefix: 'metricsdock',
    concurrency: 2,
  },
)

emitWideLogEvent(['worker'], {
  ...createWideLogEvent({
    eventName: 'sync_worker_started',
    service: 'worker',
  }),
  outcome: 'success',
  queue_name: 'sync',
  queue_prefix: 'metricsdock',
  worker_concurrency: 2,
  scheduler_cron: SYNC_SCHEDULER_CRON,
  sync_interval_minutes: SYNC_INTERVAL_MINUTES,
})

async function shutdown() {
  emitWideLogEvent(['worker'], {
    ...createWideLogEvent({
      eventName: 'sync_worker_stopping',
      service: 'worker',
    }),
    outcome: 'success',
    queue_name: 'sync',
  })
  await worker.close()
  process.exit(0)
}

process.once('SIGINT', () => void shutdown())
process.once('SIGTERM', () => void shutdown())
