import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { MailIcon } from 'lucide-react'
import { z } from 'zod'
import { AuthPage } from '#/components/auth-page.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import { authClient } from '#/lib/auth-client.ts'
import { isSignedIn } from '#/server/auth.functions.ts'

export const Route = createFileRoute('/forgot-password')({
  beforeLoad: async () => {
    if (await isSignedIn()) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: ForgotPassword,
})

const forgotPasswordSchema = z.object({
  email: z.email('Enter a valid email'),
})

function ForgotPassword() {
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const form = useForm({
    defaultValues: {
      email: '',
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null)

      const result = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (result.error) {
        setError(result.error.message ?? 'Password reset request failed')
        return
      }

      setSent(true)
    },
  })

  return (
    <AuthPage
      title="Reset your password"
      description="Enter your account email and we will send a reset link if it exists."
      switchLabel="Sign in"
      switchTo="/login"
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-6"
      >
        <FieldGroup>
          <form.Field name="email">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="email"
                    className="h-11"
                    autoComplete="email"
                    value={field.state.value}
                    aria-invalid={isInvalid}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
        {sent ? (
          <p className="text-sm text-muted-foreground">
            If that email exists in MetricsDock, a reset link is on its way.
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting]}
        >
          {([canSubmit, isSubmitting]) => (
            <Button
              type="submit"
              size="lg"
              className="h-11 w-full"
              disabled={!canSubmit}
            >
              <MailIcon data-icon="inline-start" />
              {isSubmitting ? 'Sending link...' : 'Send reset link'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthPage>
  )
}
