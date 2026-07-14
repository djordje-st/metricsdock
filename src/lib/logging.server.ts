import { AsyncLocalStorage } from 'node:async_hooks'
import { hostname } from 'node:os'
import {
  configureSync,
  getConfig,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
} from '@logtape/logtape'
import type { Logger } from '@logtape/logtape'

export type WideLogEvent = Record<string, unknown> & {
  event_name: string
  outcome?: 'success' | 'error'
}

const wideLogStorage = new AsyncLocalStorage<WideLogEvent>()
const host = hostname()

export function ensureLoggingConfigured() {
  if (getConfig()) return

  configureSync({
    sinks: {
      console: getConsoleSink({
        formatter: getJsonLinesFormatter({ properties: 'flatten' }),
      }),
    },
    loggers: [
      {
        category: ['metricsdock'],
        lowestLevel: 'info',
        sinks: ['console'],
      },
      {
        category: ['logtape', 'meta'],
        lowestLevel: 'error',
        sinks: ['console'],
      },
    ],
  })
}

export function appLogger(category: string[] = []): Logger {
  ensureLoggingConfigured()
  return getLogger(['metricsdock', ...category])
}

export function createWideLogEvent(args: {
  eventName: string
  service: 'web' | 'worker'
}) {
  return {
    app: 'metricsdock',
    event_name: args.eventName,
    service: args.service,
    environment:
      process.env.RAILWAY_ENVIRONMENT_NAME ??
      process.env.NODE_ENV ??
      'development',
    node_env: process.env.NODE_ENV,
    commit_sha:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      process.env.SOURCE_VERSION,
    railway_project_id: process.env.RAILWAY_PROJECT_ID,
    railway_service_id: process.env.RAILWAY_SERVICE_ID,
    railway_service_name: process.env.RAILWAY_SERVICE_NAME,
    railway_deployment_id: process.env.RAILWAY_DEPLOYMENT_ID,
    railway_replica_id: process.env.RAILWAY_REPLICA_ID,
    host,
  } satisfies WideLogEvent
}

export function runWithWideLogEvent<T>(event: WideLogEvent, callback: () => T) {
  return wideLogStorage.run(event, callback)
}

export function addWideLogContext(fields: Record<string, unknown>) {
  const event = wideLogStorage.getStore()

  if (event) Object.assign(event, fields)
}

export function serializeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error), type: typeof error }
  }

  return {
    message: error.message,
    type: error.name,
    stack: error.stack,
  }
}

export function emitWideLogEvent(category: string[], event: WideLogEvent) {
  const logger = appLogger(category)
  const message = event.event_name

  if (event.outcome === 'error') {
    logger.error(message, event)
    return
  }

  logger.info(message, event)
}
