import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Link, createFileRoute } from '@tanstack/react-router'
import { KeyRoundIcon } from 'lucide-react'
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

export const Route = createFileRoute('/reset-password')({
  validateSearch: z.object({
    error: z.string().optional(),
    token: z.string().optional(),
  }),
  component: ResetPassword,
})

const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  })

function resetLinkError(error?: string, token?: string) {
  if (!error && token) return null
  return 'This password reset link is invalid or expired.'
}

function ResetPassword() {
  const { error: searchError, token } = Route.useSearch()
  const [error, setError] = useState<string | null>(
    resetLinkError(searchError, token),
  )
  const [isComplete, setIsComplete] = useState(false)
  const form = useForm({
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
    validators: {
      onSubmit: resetPasswordSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null)

      if (!token) {
        setError('This password reset link is invalid or expired.')
        return
      }

      const result = await authClient.resetPassword({
        newPassword: value.password,
        token,
      })

      if (result.error) {
        setError(result.error.message ?? 'Password reset failed')
        return
      }

      setIsComplete(true)
    },
  })

  return (
    <AuthPage
      title="Choose a new password"
      description="Enter a new password for your MetricsDock account."
      switchLabel="Sign in"
      switchTo="/login"
    >
      {isComplete ? (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Your password has been reset. You can now sign in with the new
            password.
          </p>
          <Button
            size="lg"
            className="h-11 w-full"
            render={<Link to="/login" />}
          >
            Sign in
          </Button>
        </div>
      ) : (
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
            <form.Field name="password">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      className="h-11"
                      autoComplete="new-password"
                      value={field.state.value}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="confirmPassword">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Confirm password
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      className="h-11"
                      autoComplete="new-password"
                      value={field.state.value}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <form.Subscribe
            selector={(state) => [state.canSubmit, state.isSubmitting]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                size="lg"
                className="h-11 w-full"
                disabled={!canSubmit || !token}
              >
                <KeyRoundIcon data-icon="inline-start" />
                {isSubmitting ? 'Resetting password...' : 'Reset password'}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthPage>
  )
}
