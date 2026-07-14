import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { z } from 'zod'
import { AuthPage } from '#/components/auth-page.tsx'
import { Button } from '#/components/ui/button.tsx'
import { clearAppShellData } from '#/lib/app-shell.ts'
import { authClient } from '#/lib/auth-client.ts'

export const Route = createFileRoute('/accept-invitation')({
  ssr: false,
  validateSearch: z.object({
    invitationId: z.string().catch(''),
  }),
  component: AcceptInvitation,
})

function AcceptInvitation() {
  const { invitationId } = Route.useSearch()
  const [error, setError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)

  async function acceptInvitation() {
    if (!invitationId) {
      setError('Invitation link is missing an invitation ID.')
      return
    }

    setError(null)
    setIsAccepting(true)

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      })

      if (result.error) {
        setError(result.error.message ?? 'Invitation could not be accepted')
        return
      }

      await clearAppShellData()
      window.location.href = '/dashboard'
    } finally {
      setIsAccepting(false)
    }
  }

  return (
    <AuthPage
      title="Accept organization invitation"
      description="Join the organization with your MetricsDock account."
      switchLabel="Sign in"
      switchTo="/login"
    >
      <div className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          size="lg"
          className="h-11 w-full"
          disabled={isAccepting || !invitationId}
          onClick={() => void acceptInvitation()}
        >
          <CheckIcon data-icon="inline-start" />
          {isAccepting ? 'Accepting...' : 'Accept invitation'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full"
          render={
            <Link
              to="/login"
              search={{
                redirect: `/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`,
              }}
            />
          }
        >
          Sign in first
        </Button>
      </div>
    </AuthPage>
  )
}
