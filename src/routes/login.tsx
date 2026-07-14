import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { KeyRoundIcon, MailIcon } from 'lucide-react'
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

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await isSignedIn()) {
      throw redirect({ to: '/dashboard' })
    }
  },
  component: Login,
})

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})

function safeRedirectTarget(rawTarget: string | null) {
  if (!rawTarget || rawTarget.startsWith('//')) return '/dashboard'

  try {
    const target = new URL(rawTarget, window.location.origin)

    if (target.origin !== window.location.origin) return '/dashboard'
    if (!target.pathname.startsWith('/') || target.pathname.startsWith('//')) {
      return '/dashboard'
    }

    return `${target.pathname}${target.search}${target.hash}`
  } catch {
    return '/dashboard'
  }
}

function Login() {
  const [error, setError] = useState<string | null>(null)
  const [isGooglePending, setIsGooglePending] = useState(false)
  const [isPasskeyPending, setIsPasskeyPending] = useState(false)
  const form = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
    validators: {
      onSubmit: loginSchema,
    },
    onSubmit: async ({ value }) => {
      setError(null)

      const result = await authClient.signIn.email(value)

      if (result.error) {
        setError(result.error.message ?? 'Sign in failed')
        return
      }

      window.location.href = safeRedirectTarget(
        new URLSearchParams(window.location.search).get('redirect'),
      )
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
      const callbackURL = safeRedirectTarget(
        new URLSearchParams(window.location.search).get('redirect'),
      )
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
        newUserCallbackURL: callbackURL,
        errorCallbackURL: '/login',
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

  async function handlePasskeySignIn() {
    setError(null)
    setIsPasskeyPending(true)

    try {
      const result = await authClient.signIn.passkey({ autoFill: false })

      if (result.error) {
        setError(result.error.message ?? 'Passkey sign in failed')
        return
      }

      window.location.href = safeRedirectTarget(
        new URLSearchParams(window.location.search).get('redirect'),
      )
    } catch {
      setError('Passkey sign in failed')
    } finally {
      setIsPasskeyPending(false)
    }
  }

  return (
    <AuthPage
      title="Sign in to MetricsDock"
      description="Use the account connected to your Shopify Partner analytics."
      switchLabel="Create account"
      switchTo="/signup"
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
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <Button
                        render={<Link to="/forgot-password" />}
                        variant="link"
                        className="h-auto px-0 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Forgot password?
                      </Button>
                    </div>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      className="h-11"
                      autoComplete="current-password"
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
                <MailIcon data-icon="inline-start" />
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            )}
          </form.Subscribe>
        </form>

        <FieldSeparator className="my-5">or</FieldSeparator>
        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full gap-2"
            disabled={isGooglePending}
            onClick={() => void handleGoogleSignIn()}
          >
            <GoogleLogo className="size-4" />
            {isGooglePending ? 'Redirecting...' : 'Sign in with Google'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full gap-2"
            disabled={isPasskeyPending}
            onClick={() => void handlePasskeySignIn()}
          >
            <KeyRoundIcon data-icon="inline-start" />
            {isPasskeyPending ? 'Checking passkey...' : 'Sign in with passkey'}
          </Button>
        </div>
      </>
    </AuthPage>
  )
}
