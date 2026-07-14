import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { redirect } from '@tanstack/react-router'
import { auth } from '#/lib/auth.server.ts'
import { addWideLogContext } from '#/lib/logging.server.ts'
import { getActiveOrganizationIdForSession } from '#/server/organization.server.ts'

function currentRequest() {
  return getRequest()
}

export async function getSession(request?: Request) {
  const actualRequest = request ?? currentRequest()

  return auth.api.getSession({ headers: actualRequest.headers })
}

export async function requireUser(request?: Request) {
  const actualRequest = request ?? currentRequest()
  const session = await getSession(actualRequest)

  if (!session?.user) {
    throw redirect({ to: '/login', search: { redirect: actualRequest.url } })
  }

  addWideLogContext({ user_id: session.user.id })

  return session.user
}

export async function requireOrganizationContext(request?: Request) {
  const actualRequest = request ?? currentRequest()
  const authSession = await getSession(actualRequest)

  if (!authSession?.user) {
    throw redirect({ to: '/login', search: { redirect: actualRequest.url } })
  }

  const activeOrganizationId =
    typeof authSession.session.activeOrganizationId === 'string'
      ? authSession.session.activeOrganizationId
      : null

  const organizationId = await getActiveOrganizationIdForSession({
    authSession: {
      token: authSession.session.token,
      userId: authSession.session.userId,
      activeOrganizationId,
    },
    userIdentity: authSession.user,
  })

  addWideLogContext({
    user_id: authSession.user.id,
    auth_organization_id: organizationId,
  })

  return {
    user: authSession.user,
    organizationId,
  }
}

export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const request = currentRequest()
    const context = await requireOrganizationContext(request)

    return next({ context })
  },
)
