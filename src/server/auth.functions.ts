import { createServerFn } from '@tanstack/react-start'
import { getSession } from '#/server/auth.server.ts'

export const isSignedIn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const session = await getSession()

    return Boolean(session?.user)
  },
)
