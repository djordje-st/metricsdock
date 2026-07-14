import { createFileRoute } from '@tanstack/react-router'
import { workbenchHandlers } from '#/server/workbench.server.ts'

export const Route = createFileRoute('/jobs')({
  server: { handlers: workbenchHandlers },
})
