import { workbench } from '@getworkbench/tanstack-start'
import type { WorkbenchServerHandlers } from '@getworkbench/tanstack-start'
import { getSyncQueue } from '#/server/queue.server.ts'

let handlers: WorkbenchServerHandlers | undefined

function isLocalWorkbenchBypassAllowed() {
  if (process.env.NODE_ENV === 'production') return false

  try {
    const authUrl = new URL(process.env.BETTER_AUTH_URL ?? '')

    return ['localhost', '127.0.0.1', '[::1]'].includes(authUrl.hostname)
  } catch {
    return false
  }
}

function getWorkbenchHandlers() {
  if (handlers) {
    return handlers
  }

  const username = process.env.WORKBENCH_USERNAME
  const password = process.env.WORKBENCH_PASSWORD
  const hasCredentials = Boolean(username && password)

  if ((username || password) && !hasCredentials) {
    throw new Error('WORKBENCH_USERNAME and WORKBENCH_PASSWORD are required')
  }

  if (!hasCredentials && !isLocalWorkbenchBypassAllowed()) {
    throw new Error('WORKBENCH_USERNAME and WORKBENCH_PASSWORD are required')
  }

  handlers = workbench({
    queues: [getSyncQueue()],
    basePath: '/jobs',
    title: 'MetricsDock Jobs',
    ...(hasCredentials
      ? { auth: { username: username!, password: password! } }
      : {}),
  })

  return handlers
}

function handler(method: keyof WorkbenchServerHandlers) {
  return (ctx: { request: Request }) => getWorkbenchHandlers()[method](ctx)
}

export const workbenchHandlers: WorkbenchServerHandlers = {
  GET: handler('GET'),
  POST: handler('POST'),
  PUT: handler('PUT'),
  PATCH: handler('PATCH'),
  DELETE: handler('DELETE'),
}
