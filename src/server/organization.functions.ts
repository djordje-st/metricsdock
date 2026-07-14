import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { auth } from '#/lib/auth.server.ts'
import { requireOrganizationContext } from '#/server/auth.server.ts'
import { assertCanManageOrganizationMember } from '#/server/organization.server.ts'

const organizationMemberRole = z.enum(['admin', 'member'])
const organizationMemberInput = z.object({
  memberId: z.string().trim().min(1),
})

export const updateOrganizationMemberRole = createServerFn({ method: 'POST' })
  .validator(
    organizationMemberInput.extend({
      role: organizationMemberRole,
    }),
  )
  .handler(async ({ data }) => {
    const context = await requireOrganizationContext()

    await assertCanManageOrganizationMember({
      actorUserId: context.user.id,
      organizationId: context.organizationId,
      memberId: data.memberId,
    })

    await auth.api.updateMemberRole({
      headers: getRequest().headers,
      body: {
        organizationId: context.organizationId,
        memberId: data.memberId,
        role: data.role,
      },
    })

    return { memberId: data.memberId, role: data.role }
  })

export const removeOrganizationMember = createServerFn({ method: 'POST' })
  .validator(organizationMemberInput)
  .handler(async ({ data }) => {
    const context = await requireOrganizationContext()

    await assertCanManageOrganizationMember({
      actorUserId: context.user.id,
      organizationId: context.organizationId,
      memberId: data.memberId,
    })

    await auth.api.removeMember({
      headers: getRequest().headers,
      body: {
        organizationId: context.organizationId,
        memberIdOrEmail: data.memberId,
      },
    })

    return { memberId: data.memberId }
  })
