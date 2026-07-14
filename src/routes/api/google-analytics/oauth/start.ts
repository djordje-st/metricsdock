import { createFileRoute } from '@tanstack/react-router'
import { requireOrganizationContext } from '#/server/auth.server.ts'
import {
  buildGoogleAnalyticsOAuthUrl,
  normalizeGoogleAnalyticsPropertyId,
} from '#/server/google-analytics.server.ts'

export const Route = createFileRoute('/api/google-analytics/oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        return startGoogleAnalyticsOAuth({
          request,
          input: new URL(request.url).searchParams,
          responseType: 'redirect',
        })
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const input = new URLSearchParams()

        for (const [key, value] of Object.entries(body)) {
          if (typeof value === 'string') input.set(key, value)
        }

        return startGoogleAnalyticsOAuth({
          request,
          input,
          responseType: 'json',
        })
      },
    },
  },
})

async function startGoogleAnalyticsOAuth({
  request,
  input,
  responseType,
}: {
  request: Request
  input: URLSearchParams
  responseType: 'redirect' | 'json'
}) {
  const context = await requireOrganizationContext(request).catch(() => null)

  if (!context) {
    if (responseType === 'json') {
      return Response.json(
        { error: 'Sign in again to connect Google Analytics.' },
        { status: 401 },
      )
    }

    return Response.redirect(new URL('/login', request.url), 302)
  }

  const propertyId = normalizeGoogleAnalyticsPropertyId(
    input.get('propertyId') ?? '',
  )

  if (!propertyId) {
    if (responseType === 'json') {
      return Response.json(
        { error: 'Google Analytics property ID must be numeric.' },
        { status: 400 },
      )
    }

    return redirectToSettings(request, {
      gaError: 'Google Analytics property ID must be numeric.',
    })
  }

  const oauthUrl = buildGoogleAnalyticsOAuthUrl({
    userId: context.user.id,
    organizationId: context.organizationId,
    propertyId,
    propertyName: input.get('propertyName'),
    appId: input.get('appId'),
    apiKey: input.get('apiKey'),
  })

  if (responseType === 'json') return Response.json({ url: oauthUrl })

  return Response.redirect(oauthUrl, 302)
}

function redirectToSettings(request: Request, params: Record<string, string>) {
  const url = new URL('/settings/connections', request.url)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return Response.redirect(url, 302)
}
