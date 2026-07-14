import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db } from '#/db/index.server.ts'
import { member, organization, session, user } from '#/db/schema.ts'

type UserIdentity = {
  id: string
  name?: string | null
  email?: string | null
}

type SessionIdentity = {
  token: string
  userId: string
  activeOrganizationId?: string | null
}

export type ManageableOrganizationRole = 'admin' | 'member'

type OrganizationRole = ManageableOrganizationRole | 'owner'

function personalOrganizationId(userId: string) {
  return `personal_${userId}`
}

function personalOrganizationSlug(userId: string) {
  const suffix = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)

  return `personal-${suffix || 'workspace'}`
}

function personalOrganizationName(userIdentity: UserIdentity) {
  const name = userIdentity.name?.trim()
  const emailName = userIdentity.email?.split('@').at(0)?.trim()
  const label = name || emailName || 'Personal'

  return `${label}'s organization`
}

export async function ensurePersonalOrganizationForUser(
  userIdentity: UserIdentity,
) {
  const organizationId = personalOrganizationId(userIdentity.id)
  const now = new Date()

  await db
    .insert(organization)
    .values({
      id: organizationId,
      name: personalOrganizationName(userIdentity),
      slug: personalOrganizationSlug(userIdentity.id),
      metadata: JSON.stringify({ personal: true, ownerId: userIdentity.id }),
      createdAt: now,
    })
    .onConflictDoNothing({ target: organization.id })

  await db
    .insert(member)
    .values({
      id: randomUUID(),
      organizationId,
      userId: userIdentity.id,
      role: 'owner',
      createdAt: now,
    })
    .onConflictDoNothing({
      target: [member.organizationId, member.userId],
    })

  return organizationId
}

export async function ensurePersonalOrganizationForUserId(userId: string) {
  const savedUser = (
    await db.select().from(user).where(eq(user.id, userId)).limit(1)
  ).at(0)

  if (!savedUser) throw new Error('User not found')

  return ensurePersonalOrganizationForUser(savedUser)
}

async function isOrganizationMember(args: {
  userId: string
  organizationId: string
}) {
  const membership = (
    await db
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, args.userId),
          eq(member.organizationId, args.organizationId),
        ),
      )
      .limit(1)
  ).at(0)

  return Boolean(membership)
}

async function getFirstOrganizationIdForUser(userId: string) {
  return (
    await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt))
      .limit(1)
  ).at(0)?.organizationId
}

export async function getDefaultOrganizationIdForUserId(userId: string) {
  return (
    (await getFirstOrganizationIdForUser(userId)) ??
    (await ensurePersonalOrganizationForUserId(userId))
  )
}

export async function getActiveOrganizationIdForSession(args: {
  authSession: SessionIdentity
  userIdentity: UserIdentity
}) {
  const activeOrganizationId = args.authSession.activeOrganizationId

  if (
    activeOrganizationId &&
    (await isOrganizationMember({
      userId: args.userIdentity.id,
      organizationId: activeOrganizationId,
    }))
  ) {
    return activeOrganizationId
  }

  const organizationId =
    (await getFirstOrganizationIdForUser(args.userIdentity.id)) ??
    (await ensurePersonalOrganizationForUser(args.userIdentity))

  await db
    .update(session)
    .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
    .where(eq(session.token, args.authSession.token))

  return organizationId
}

export async function assertCanManageOrganizationMember(args: {
  actorUserId: string
  organizationId: string
  memberId: string
}) {
  const [actorMember, targetMember] = await Promise.all([
    getOrganizationMemberByUserId({
      userId: args.actorUserId,
      organizationId: args.organizationId,
    }),
    getOrganizationMemberById({
      memberId: args.memberId,
      organizationId: args.organizationId,
    }),
  ])

  if (!actorMember) throw new Error('You are not a member of this organization')
  if (!targetMember) throw new Error('Member not found')

  const actorRole = organizationRole(actorMember.role)
  const targetRole = organizationRole(targetMember.role)

  if (
    actorRole === 'owner' &&
    (targetRole === 'admin' || targetRole === 'member')
  ) {
    return
  }

  if (actorRole === 'admin' && targetRole === 'member') {
    return
  }

  throw new Error('You are not allowed to manage this member')
}

async function getOrganizationMemberByUserId(args: {
  userId: string
  organizationId: string
}) {
  return (
    await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, args.userId),
          eq(member.organizationId, args.organizationId),
        ),
      )
      .limit(1)
  ).at(0)
}

async function getOrganizationMemberById(args: {
  memberId: string
  organizationId: string
}) {
  return (
    await db
      .select({ id: member.id, role: member.role })
      .from(member)
      .where(
        and(
          eq(member.id, args.memberId),
          eq(member.organizationId, args.organizationId),
        ),
      )
      .limit(1)
  ).at(0)
}

function organizationRole(role: string): OrganizationRole | null {
  const roles = role.split(',').map((value) => value.trim())

  if (roles.includes('owner')) return 'owner'
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('member')) return 'member'

  return null
}
