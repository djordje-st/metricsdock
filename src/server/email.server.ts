import { createElement } from 'react'
import { render } from 'jsx-email'
import { OrganizationInvitationEmail } from '#/emails/organization-invitation-email.tsx'
import { ResetPasswordEmail } from '#/emails/reset-password-email.tsx'
import { appLogger, serializeError } from '#/lib/logging.server.ts'

const plunkSendUrl = 'https://next-api.useplunk.com/v1/send'
const logger = appLogger(['email'])

function requiredEmailEnv(name: 'PLUNK_API_KEY' | 'PLUNK_FROM_EMAIL') {
  const value = process.env[name]?.trim()

  if (!value || value.startsWith('replace-with')) {
    throw new Error(`${name} is required`)
  }

  return value
}

function emailDomain(email: string) {
  return email.split('@').at(1)?.toLowerCase() ?? 'unknown'
}

async function sendPlunkEmail({
  body,
  subject,
  to,
}: {
  body: string
  subject: string
  to: string
}) {
  const response = await fetch(plunkSendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requiredEmailEnv('PLUNK_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      body,
      from: {
        email: requiredEmailEnv('PLUNK_FROM_EMAIL'),
        name: process.env.PLUNK_FROM_NAME?.trim() || 'MetricsDock',
      },
      subject,
      to,
    }),
  })

  const responseText = await response.text()

  if (!response.ok) {
    throw new Error(
      `Plunk send failed with ${response.status}: ${responseText.slice(0, 500)}`,
    )
  }

  if (!responseText) return

  const payload = JSON.parse(responseText) as { success?: boolean }

  if (payload.success === false) {
    throw new Error('Plunk send failed')
  }
}

export async function sendPasswordResetEmail({
  resetUrl,
  to,
  userName,
}: {
  resetUrl: string
  to: string
  userName?: string | null
}) {
  const body = await render(
    createElement(ResetPasswordEmail, { resetUrl, userName }),
    { inlineCss: true, minify: true },
  )

  await sendPlunkEmail({
    body,
    subject: 'Reset your MetricsDock password',
    to,
  })
}

export async function sendOrganizationInvitationEmail({
  invitationUrl,
  inviterName,
  organizationName,
  role,
  to,
}: {
  invitationUrl: string
  inviterName?: string | null
  organizationName: string
  role?: string | null
  to: string
}) {
  const body = await render(
    createElement(OrganizationInvitationEmail, {
      invitationUrl,
      inviterName,
      organizationName,
      role,
    }),
    { inlineCss: true, minify: true },
  )

  await sendPlunkEmail({
    body,
    subject: `Join ${organizationName} on MetricsDock`,
    to,
  })
}

export function sendPasswordResetEmailInBackground(args: {
  resetUrl: string
  to: string
  userName?: string | null
}) {
  void sendPasswordResetEmail(args).catch((error: unknown) => {
    logger.error('Password reset email send failed', {
      email_domain: emailDomain(args.to),
      error: serializeError(error),
      event_name: 'password_reset_email_send',
      outcome: 'error',
    })
  })
}
