import { randomUUID } from 'node:crypto'
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'
import {
  createWideLogEvent,
  emitWideLogEvent,
  runWithWideLogEvent,
  serializeError,
} from '#/lib/logging.server.ts'
import type { WideLogEvent } from '#/lib/logging.server.ts'

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
})

const requestLogger = createMiddleware().server(
  async ({ next, request, pathname, handlerType, serverFnMeta }) => {
    const start = performance.now()
    const requestId =
      request.headers.get('x-request-id') ??
      request.headers.get('x-correlation-id') ??
      randomUUID()
    const event: WideLogEvent = {
      ...createWideLogEvent({ eventName: 'http_request', service: 'web' }),
      request_id: requestId,
      request_method: request.method,
      path: pathname,
      handler_type: handlerType,
      server_function_id: serverFnMeta?.id,
      server_function_name: serverFnMeta?.name,
      request_body_bytes: contentLength(request),
      user_agent: request.headers.get('user-agent') ?? undefined,
    }

    return runWithWideLogEvent(event, async () => {
      try {
        const result = await next()
        event.response_status_code = result.response.status
        event.outcome = result.response.status >= 500 ? 'error' : 'success'
        event.response_request_id_header_set = setResponseHeader(
          result.response,
          'x-request-id',
          requestId,
        )

        return result
      } catch (error) {
        event.response_status_code = 500
        event.outcome = 'error'
        event.error = serializeError(error)
        throw error
      } finally {
        event.duration_ms = Math.round(performance.now() - start)
        emitWideLogEvent(['web'], event)
      }
    })
  },
)

function contentLength(request: Request) {
  const value = request.headers.get('content-length')
  if (!value) return undefined

  const length = Number(value)
  return Number.isFinite(length) ? length : undefined
}

function setResponseHeader(response: Response, name: string, value: string) {
  try {
    response.headers.set(name, value)
    return true
  } catch {
    return false
  }
}

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, requestLogger],
}))
