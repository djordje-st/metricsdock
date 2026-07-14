import { createFileRoute } from '@tanstack/react-router'
import { requireOrganizationContext } from '#/server/auth.server.ts'
import { saveGoogleAnalyticsOAuthCallback } from '#/server/google-analytics.server.ts'

export const Route = createFileRoute('/api/google-analytics/oauth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const context = await requireOrganizationContext(request).catch(
          () => null,
        )

        if (!context) {
          return Response.redirect(new URL('/login', request.url), 302)
        }

        const url = new URL(request.url)
        const error = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')

        if (error) {
          return redirectToSettings(request, {
            gaError: `Google Analytics OAuth failed: ${error}`,
          })
        }

        if (!code || !state) {
          return redirectToSettings(request, {
            gaError:
              'Google Analytics OAuth callback was missing code or state.',
          })
        }

        try {
          const result = await saveGoogleAnalyticsOAuthCallback({
            userId: context.user.id,
            organizationId: context.organizationId,
            code,
            state,
          })

          return redirectToSettings(request, {
            gaConnected: '1',
            ...(result.mapping ? { gaMapped: '1' } : {}),
          })
        } catch (callbackError) {
          return redirectToSettings(request, {
            gaError: errorMessage(callbackError),
          })
        }
      },
    },
  },
})

function redirectToSettings(request: Request, params: Record<string, string>) {
  const url = new URL('/settings/connections', request.url)

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  return Response.redirect(url, 302)
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Google Analytics OAuth failed.'
}
