import { randomUUID } from 'node:crypto'
import { Queue, QueueEvents } from 'bullmq'
import type { ConnectionOptions } from 'bullmq'

export type SyncJobData = {
  userId?: string
  authOrganizationId?: string
  connectionId?: number
  appId?: string
  reason: 'manual' | 'scheduled' | 'connection'
}

export const SYNC_SCHEDULER_ID = 'sync-scheduler'
export const SYNC_SCHEDULER_CRON =
  process.env.SYNC_SCHEDULER_CRON?.trim() || '0 0 * * *'
export const SYNC_INTERVAL_MINUTES = Number(
  process.env.SYNC_INTERVAL_MINUTES ?? 1440,
)

if (!Number.isFinite(SYNC_INTERVAL_MINUTES) || SYNC_INTERVAL_MINUTES <= 0) {
  throw new Error('SYNC_INTERVAL_MINUTES must be a positive number')
}

export type SyncJobName = 'sync' | 'sync-scheduler' | typeof SYNC_SCHEDULER_ID

type SyncQueue = Queue<SyncJobData, void, SyncJobName>

let connection: ConnectionOptions | undefined
let queue: SyncQueue | undefined
let events: QueueEvents | undefined

export function getQueueConnection() {
  const url = process.env.VALKEY_URL

  if (!url) {
    throw new Error('VALKEY_URL is required for queues')
  }

  if (!connection) {
    const parsed = new URL(url)
    const db = parsed.pathname.slice(1)

    connection = {
      host: parsed.hostname,
      port: Number(
        parsed.port || (parsed.protocol === 'rediss:' ? 6380 : 6379),
      ),
      maxRetriesPerRequest: null,
      ...(parsed.username
        ? { username: decodeURIComponent(parsed.username) }
        : {}),
      ...(parsed.password
        ? { password: decodeURIComponent(parsed.password) }
        : {}),
      ...(db ? { db: Number(db) } : {}),
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    }
  }

  return connection
}

export function getSyncQueue() {
  queue ??= new Queue<SyncJobData, void, SyncJobName>('sync', {
    connection: getQueueConnection(),
    prefix: 'metricsdock',
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7, count: 500 },
    },
  })

  return queue
}

export function getSyncQueueEvents() {
  events ??= new QueueEvents('sync', {
    connection: getQueueConnection(),
    prefix: 'metricsdock',
  })

  return events
}

const activeJobStates = [
  'active',
  'delayed',
  'prioritized',
  'waiting',
  'waiting-children',
] as const

function safeJobIdPart(part: string | number | undefined) {
  return String(part ?? 'all').replaceAll(':', '_')
}

function syncTargetKey(data: SyncJobData) {
  return [
    'sync',
    data.authOrganizationId ?? data.userId,
    data.connectionId,
    data.appId,
  ]
    .map(safeJobIdPart)
    .join('__')
}

function syncJobOptions(data: SyncJobData) {
  const targetKey = syncTargetKey(data)
  const jobId = [targetKey, data.reason, Date.now(), randomUUID()]
    .map(safeJobIdPart)
    .join('__')

  return {
    jobId,
    deduplication: { id: targetKey },
  }
}

async function getActiveSyncTargetKeys(syncQueue: SyncQueue) {
  const activeJobs = await syncQueue.getJobs(
    [...activeJobStates],
    0,
    1000,
    false,
  )

  return new Set(
    activeJobs
      .filter((job) => job.name === 'sync')
      .map((job) => syncTargetKey(job.data)),
  )
}

async function findActiveSyncJob(syncQueue: SyncQueue, data: SyncJobData) {
  const targetKey = syncTargetKey(data)
  const activeJobs = await syncQueue.getJobs(
    [...activeJobStates],
    0,
    1000,
    false,
  )

  return activeJobs.find(
    (job) => job.name === 'sync' && syncTargetKey(job.data) === targetKey,
  )
}

export async function enqueueSync(data: SyncJobData) {
  const syncQueue = getSyncQueue()
  const activeJob = await findActiveSyncJob(syncQueue, data)

  if (activeJob) return activeJob

  return syncQueue.add('sync', data, syncJobOptions(data))
}

export async function enqueueSyncBatch(items: Array<SyncJobData>) {
  const syncQueue = getSyncQueue()
  const activeTargetKeys = await getActiveSyncTargetKeys(syncQueue)
  const jobs = new Map<string, SyncJobData>()

  for (const data of items) {
    const targetKey = syncTargetKey(data)
    if (activeTargetKeys.has(targetKey) || jobs.has(targetKey)) continue

    jobs.set(targetKey, data)
  }

  if (!jobs.size) return []

  return syncQueue.addBulk(
    [...jobs.values()].map((data) => ({
      name: 'sync' as const,
      data,
      opts: syncJobOptions(data),
    })),
  )
}

export async function ensureSyncScheduler() {
  const syncQueue = getSyncQueue()

  return syncQueue.upsertJobScheduler(
    SYNC_SCHEDULER_ID,
    { pattern: SYNC_SCHEDULER_CRON },
    {
      name: 'sync-scheduler',
      data: { reason: 'scheduled' },
    },
  )
}
