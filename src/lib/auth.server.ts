import { passkey } from '@better-auth/passkey'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import {
  lastLoginMethod,
  organization as organizationPlugin,
} from 'better-auth/plugins'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db/index.server.ts'
import * as schema from '#/db/schema.ts'
import {
  sendOrganizationInvitationEmail,
  sendPasswordResetEmailInBackground,
} from '#/server/email.server.ts'
import {
  ensurePersonalOrganizationForUser,
  getDefaultOrganizationIdForUserId,
} from '#/server/organization.server.ts'

if (!process.env.BETTER_AUTH_URL) {
  throw new Error('BETTER_AUTH_URL is required')
}

if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error('BETTER_AUTH_SECRET is required')
}

if (process.env.BETTER_AUTH_SECRET.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must be at least 32 characters')
}

if (!process.env.GOOGLE_CLIENT_ID) {
  throw new Error('GOOGLE_CLIENT_ID is required')
}

if (!process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error('GOOGLE_CLIENT_SECRET is required')
}

const betterAuthUrl = new URL(process.env.BETTER_AUTH_URL)

function invitationUrl(invitationId: string) {
  const url = new URL('/accept-invitation', betterAuthUrl.origin)
  url.searchParams.set('invitationId', invitationId)

  return url.href
}

export const auth = betterAuth({
  appName: 'MetricsDock',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ url, user }) => {
      sendPasswordResetEmailInBackground({
        resetUrl: url,
        to: user.email,
        userName: user.name,
      })
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
  },
  rateLimit: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: async (createdUser) => {
          await ensurePersonalOrganizationForUser(createdUser)
        },
      },
    },
    session: {
      create: {
        before: async (createdSession) => {
          return {
            data: {
              ...createdSession,
              activeOrganizationId: await getDefaultOrganizationIdForUserId(
                createdSession.userId,
              ),
            },
          }
        },
      },
    },
  },
  plugins: [
    organizationPlugin({
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      membershipLimit: 25,
      invitationExpiresIn: 60 * 60 * 24 * 7,
      invitationLimit: 25,
      cancelPendingInvitationsOnReInvite: true,
      requireEmailVerificationOnInvitation: true,
      disableOrganizationDeletion: true,
      sendInvitationEmail: async (data) => {
        await sendOrganizationInvitationEmail({
          invitationUrl: invitationUrl(data.id),
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          role: data.role,
          to: data.email,
        })
      },
    }),
    passkey({
      rpID: betterAuthUrl.hostname,
      rpName: 'MetricsDock',
      origin: betterAuthUrl.origin,
    }),
    lastLoginMethod(),
    tanstackStartCookies(),
  ],
})
