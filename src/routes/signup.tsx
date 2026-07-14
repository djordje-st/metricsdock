import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { UserPlusIcon } from 'lucide-react'
import { z } from 'zod'
import { authClient } from '#/lib/auth-client.ts'
import { AuthPage, GoogleLogo } from '#/components/auth-page.tsx'
import { Button } from '#/components/ui/button.tsx'
import { isSignedIn } from '#/server/auth.functions.ts'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'

export const Route = createFileRoute('/signup')({
  beforeLoad: async () => {
    if (await isSignedIn()) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Signup,
})

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

function Signup() {
  const [error, setError] = useState<string | null>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      password: '',
    },
    validators: {
      onSubmit: signupSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null)

      const result = await authClient.signUp.email(value)

      if (result.error) {
        setError(result.error.message ?? 'Sign up failed')
        return
      }

      window.location.href = '/dashboard'
    },
  })

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      setError('Google sign in failed')
    }
  }, [])

  async function handleGoogleSignIn() {
    setError(null)
    setIsGooglePending(true)

    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/dashboard',
        newUserCallbackURL: '/dashboard',
        errorCallbackURL: '/signup',
      })

      if (result.error) {
        setError(result.error.message ?? 'Google sign in failed')
        return
      }

      if (result.data.url) {
        window.location.href = result.data.url
      }
    } catch {
      setError('Google sign in failed')
    } finally {
      setIsGooglePending(false)
    }
  }

  return (
    <AuthPage
      title="Create your MetricsDock account"
      description="Connect your Shopify Partner account after signup."
      switchLabel="Sign in"
      switchTo="/login"
    >
      <>
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
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      className="h-11"
                      autoComplete="name"
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
            <form.Field name="password">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
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
                disabled={!canSubmit}
              >
                <UserPlusIcon data-icon="inline-start" />
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <FieldSeparator className="my-5">or</FieldSeparator>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11 w-full gap-2"
          disabled={isGooglePending}
          onClick={() => void handleGoogleSignIn()}
        >
          <GoogleLogo className="size-4" />
          {isGooglePending ? 'Redirecting...' : 'Sign up with Google'}
        </Button>
      </>
    </AuthPage>
  )
}
