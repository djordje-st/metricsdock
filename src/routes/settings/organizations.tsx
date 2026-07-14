import { useEffect, useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import {
  CopyIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  UserPlusIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'
import { AppShell } from '#/components/app-shell.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '#/components/ui/alert-dialog.tsx'
import { Badge } from '#/components/ui/badge.tsx'
import { Button } from '#/components/ui/button.tsx'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card.tsx'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#/components/ui/dialog.tsx'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#/components/ui/field.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import { formatDateTime } from '#/lib/format.ts'
import {
  clearAppShellData,
  notifyOrganizationContextChanged,
} from '#/lib/app-shell.ts'
import { authClient } from '#/lib/auth-client.ts'
import {
  removeOrganizationMember,
  updateOrganizationMemberRole,
} from '#/server/organization.functions.ts'

export const Route = createFileRoute('/settings/organizations')({
  ssr: false,
  component: OrganizationsSettings,
})

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required'),
})

const renameOrganizationSchema = z.object({
  name: z.string().trim().min(1, 'Organization name is required'),
})

const inviteSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  role: z.enum(['member', 'admin']),
})

const manageableRoles = ['member', 'admin'] as const

type OrganizationSummary = {
  id: string
  name: string
  slug: string
  createdAt: Date | string
}

type OrganizationMember = {
  id: string
  userId: string
  role: string
  createdAt: Date | string
  user?: {
    name?: string | null
    email?: string | null
  }
}

type OrganizationInvitation = {
  id: string
  organizationId: string
  email: string
  role: string
  status: string
  expiresAt: Date | string
  createdAt: Date | string
}

type ActiveOrganization = OrganizationSummary & {
  members: OrganizationMember[]
  invitations: OrganizationInvitation[]
}

type ManageableRole = (typeof manageableRoles)[number]
type OrganizationRole = ManageableRole | 'owner'

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'organization'
  )
}

function organizationSlug(name: string) {
  return `${slugify(name)}-${crypto.randomUUID().slice(0, 8)}`
}

function inviteUrl(invitationId: string) {
  if (typeof window === 'undefined') return ''

  return `${window.location.origin}/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`
}

function organizationRole(role: string): OrganizationRole | null {
  const roles = role.split(',').map((value) => value.trim())

  if (roles.includes('owner')) return 'owner'
  if (roles.includes('admin')) return 'admin'
  if (roles.includes('member')) return 'member'

  return null
}

function isManageableRole(role: string | null): role is ManageableRole {
  return role === 'member' || role === 'admin'
}

function roleLabel(role: string) {
  const normalizedRole = organizationRole(role)

  if (normalizedRole === 'owner') return 'Owner'
  if (normalizedRole === 'admin') return 'Admin'
  if (normalizedRole === 'member') return 'Member'

  return role
}

function memberDisplayName(member: OrganizationMember) {
  return member.user?.name ?? member.user?.email ?? member.userId
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function OrganizationsSettings() {
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([])
  const [activeOrganization, setActiveOrganization] =
    useState<ActiveOrganization | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [pendingOrganizationId, setPendingOrganizationId] = useState<
    string | null
  >(null)
  const [pendingMemberAction, setPendingMemberAction] = useState<{
    memberId: string
    action: 'role' | 'remove'
  } | null>(null)

  async function loadOrganizations() {
    setIsLoading(true)

    try {
      const [organizationsResult, activeOrganizationResult, sessionResult] =
        await Promise.all([
          authClient.organization.list(),
          authClient.organization.getFullOrganization(),
          authClient.getSession(),
        ])

      if (organizationsResult.error) {
        toast.error(organizationsResult.error.message ?? 'Organizations failed')
      }

      if (activeOrganizationResult.error) {
        setActiveOrganization(null)
      } else {
        setActiveOrganization(activeOrganizationResult.data)
      }

      setOrganizations(
        (organizationsResult.data as OrganizationSummary[] | null) ?? [],
      )
      setCurrentUserId(sessionResult.data?.user.id ?? null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadOrganizations()
  }, [])

  async function switchOrganization(organizationId: string) {
    setPendingOrganizationId(organizationId)

    try {
      const result = await authClient.organization.setActive({ organizationId })

      if (result.error) {
        toast.error(result.error.message ?? 'Organization switch failed')
        return
      }

      await clearAppShellData()
      await loadOrganizations()
      notifyOrganizationContextChanged()
      toast.success('Organization switched')
    } finally {
      setPendingOrganizationId(null)
    }
  }

  async function copyInvitation(invitationId: string) {
    await navigator.clipboard.writeText(inviteUrl(invitationId))
    toast.success('Invitation link copied')
  }

  async function renameOrganization(name: string) {
    if (!activeOrganization) return

    const result = await authClient.organization.update({
      organizationId: activeOrganization.id,
      data: { name: name.trim() },
    })

    if (result.error) {
      toast.error(result.error.message ?? 'Organization was not renamed')
      return
    }

    await loadOrganizations()
    notifyOrganizationContextChanged()
    toast.success('Organization renamed')
  }

  const currentMemberRole = organizationRole(
    activeOrganization?.members.find(
      (member) => member.userId === currentUserId,
    )?.role ?? '',
  )

  function canManageMember(member: OrganizationMember) {
    const targetRole = organizationRole(member.role)

    return (
      (currentMemberRole === 'owner' &&
        (targetRole === 'admin' || targetRole === 'member')) ||
      (currentMemberRole === 'admin' && targetRole === 'member')
    )
  }

  async function changeMemberRole(
    member: OrganizationMember,
    role: ManageableRole,
  ) {
    if (organizationRole(member.role) === role) return

    setPendingMemberAction({ memberId: member.id, action: 'role' })

    try {
      await updateOrganizationMemberRole({
        data: { memberId: member.id, role },
      })
      await loadOrganizations()
      toast.success('Member role updated')
    } catch (error) {
      toast.error(errorMessage(error, 'Member role was not updated'))
    } finally {
      setPendingMemberAction(null)
    }
  }

  async function removeMember(member: OrganizationMember) {
    setPendingMemberAction({ memberId: member.id, action: 'remove' })

    try {
      await removeOrganizationMember({ data: { memberId: member.id } })
      await loadOrganizations()
      toast.success('Member removed')
    } catch (error) {
      toast.error(errorMessage(error, 'Member was not removed'))
    } finally {
      setPendingMemberAction(null)
    }
  }

  const canInvite =
    currentMemberRole === 'owner' || currentMemberRole === 'admin'

  return (
    <AppShell
      title="Organizations"
      description="Workspaces that keep Partner accounts and reports separate."
    >
      {isLoading ? (
        <Card>
          <CardHeader>
            <CardTitle>Organizations</CardTitle>
            <CardDescription>Loading organization data...</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Current organization</CardTitle>
                <CardDescription>
                  Partner accounts and reports are scoped to this organization.
                </CardDescription>
                {activeOrganization ? (
                  <CardAction>
                    <RenameOrganizationDialog
                      key={activeOrganization.id}
                      organization={activeOrganization}
                      onRename={renameOrganization}
                    />
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {activeOrganization ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <span className="font-heading text-xl font-semibold">
                        {activeOrganization.name}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Created {formatDateTime(activeOrganization.createdAt)}
                      </span>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {activeOrganization.members.map((member) => {
                        const canManage = canManageMember(member)
                        const normalizedRole = organizationRole(member.role)
                        const manageableRole = isManageableRole(normalizedRole)
                          ? normalizedRole
                          : null
                        const pendingAction =
                          pendingMemberAction?.memberId === member.id
                            ? pendingMemberAction.action
                            : null

                        return (
                          <div
                            key={member.id}
                            className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {memberDisplayName(member)}
                              </div>
                              {member.user?.name && member.user.email ? (
                                <div className="truncate text-sm text-muted-foreground">
                                  {member.user.email}
                                </div>
                              ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {canManage && manageableRole ? (
                                <Select
                                  value={manageableRole}
                                  onValueChange={(value) => {
                                    if (isManageableRole(value)) {
                                      void changeMemberRole(member, value)
                                    }
                                  }}
                                  disabled={pendingAction !== null}
                                  items={[
                                    { label: 'Member', value: 'member' },
                                    { label: 'Admin', value: 'admin' },
                                  ]}
                                >
                                  <SelectTrigger
                                    className="w-32"
                                    aria-label={`Role for ${memberDisplayName(member)}`}
                                  >
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent alignItemWithTrigger={false}>
                                    <SelectGroup>
                                      <SelectItem value="member">
                                        Member
                                      </SelectItem>
                                      <SelectItem value="admin">
                                        Admin
                                      </SelectItem>
                                    </SelectGroup>
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="secondary">
                                  {roleLabel(member.role)}
                                </Badge>
                              )}
                              <span className="text-sm text-muted-foreground">
                                Joined {formatDateTime(member.createdAt)}
                              </span>
                            </div>

                            {canManage ? (
                              <AlertDialog>
                                <AlertDialogTrigger
                                  render={
                                    <Button
                                      type="button"
                                      variant="destructive"
                                      size="sm"
                                      disabled={pendingAction !== null}
                                      className="self-start"
                                    />
                                  }
                                >
                                  <Trash2Icon data-icon="inline-start" />
                                  {pendingAction === 'remove'
                                    ? 'Removing...'
                                    : 'Remove'}
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Remove member?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {memberDisplayName(member)} will lose
                                      access to {activeOrganization.name}. This
                                      does not delete their MetricsDock account.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel
                                      disabled={pendingAction !== null}
                                    >
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      type="button"
                                      variant="destructive"
                                      disabled={pendingAction !== null}
                                      onClick={() => void removeMember(member)}
                                    >
                                      <Trash2Icon data-icon="inline-start" />
                                      {pendingAction === 'remove'
                                        ? 'Removing...'
                                        : 'Remove member'}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active organization is selected.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Invitations</CardTitle>
                <CardDescription>
                  Pending invitations for{' '}
                  {activeOrganization?.name ?? 'this organization'}.
                </CardDescription>
                {canInvite ? (
                  <CardAction>
                    <InviteMemberDialog
                      disabled={!activeOrganization}
                      onInvited={loadOrganizations}
                    />
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {activeOrganization?.invitations.length ? (
                  activeOrganization.invitations.map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{invitation.email}</div>
                          <div className="text-sm text-muted-foreground">
                            Expires {formatDateTime(invitation.expiresAt)}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">
                            {roleLabel(invitation.role)}
                          </Badge>
                          <Badge
                            variant={
                              invitation.status === 'pending'
                                ? 'warning'
                                : 'secondary'
                            }
                          >
                            {invitation.status}
                          </Badge>
                        </div>
                      </div>
                      {invitation.status === 'pending' ? (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Input
                            readOnly
                            value={inviteUrl(invitation.id)}
                            className="font-mono text-xs"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void copyInvitation(invitation.id)}
                          >
                            <CopyIcon data-icon="inline-start" />
                            Copy link
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No pending invitations.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Your organizations</CardTitle>
              <CardDescription>
                Switch the active workspace, or create a new one.
              </CardDescription>
              <CardAction>
                <CreateOrganizationDialog onCreated={loadOrganizations} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {organizations.map((organization) => {
                const isActive = organization.id === activeOrganization?.id

                return (
                  <Button
                    key={organization.id}
                    type="button"
                    variant={isActive ? 'secondary' : 'outline'}
                    disabled={
                      pendingOrganizationId === organization.id || isActive
                    }
                    onClick={() => void switchOrganization(organization.id)}
                    className="justify-between"
                  >
                    <span className="truncate">{organization.name}</span>
                    {isActive ? (
                      <Badge variant="outline">Active</Badge>
                    ) : pendingOrganizationId === organization.id ? (
                      <span className="text-xs text-muted-foreground">
                        Switching...
                      </span>
                    ) : null}
                  </Button>
                )
              })}
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  )
}

function CreateOrganizationDialog({
  onCreated,
}: {
  onCreated: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const form = useForm({
    defaultValues: {
      name: '',
    },
    validators: {
      onSubmit: createOrganizationSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.organization.create({
        name: value.name.trim(),
        slug: organizationSlug(value.name),
      })

      if (result.error) {
        toast.error(result.error.message ?? 'Organization was not created')
        return
      }

      form.reset()
      await clearAppShellData()
      await onCreated()
      notifyOrganizationContextChanged()
      toast.success('Organization created')
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <PlusIcon data-icon="inline-start" />
        New
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create organization</DialogTitle>
          <DialogDescription>
            A new workspace keeps its Partner accounts, apps, and reports
            separate from your other organizations.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="name">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    Organization name
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    placeholder="Acme Apps"
                    aria-invalid={isInvalid}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              )
            }}
          </form.Field>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Creating...' : 'Create organization'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function InviteMemberDialog({
  disabled,
  onInvited,
}: {
  disabled: boolean
  onInvited: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const form = useForm({
    defaultValues: {
      email: '',
      role: 'member' as 'member' | 'admin',
    },
    validators: {
      onSubmit: inviteSchema,
    },
    onSubmit: async ({ value }) => {
      const result = await authClient.organization.inviteMember({
        email: value.email.trim(),
        role: value.role,
        resend: true,
      })

      if (result.error) {
        toast.error(result.error.message ?? 'Invitation was not created')
        return
      }

      form.reset()
      await onInvited()
      toast.success('Invitation created')
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={disabled} />}>
        <UserPlusIcon data-icon="inline-start" />
        Invite member
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Send an invitation link. Admins can manage members; members get read
            access to reports.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <FieldGroup className="gap-4">
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
                      value={field.state.value}
                      placeholder="teammate@example.com"
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

            <form.Field name="role">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>Role</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value === 'member' || value === 'admin') {
                          field.handleChange(value)
                        }
                      }}
                      items={[
                        { label: 'Member', value: 'member' },
                        { label: 'Admin', value: 'admin' },
                      ]}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={isInvalid}
                      >
                        <SelectValue placeholder="Choose a role" />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          <SelectItem value="member">Member</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Inviting...' : 'Send invitation'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RenameOrganizationDialog({
  organization,
  onRename,
}: {
  organization: ActiveOrganization
  onRename: (name: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const form = useForm({
    defaultValues: {
      name: organization.name,
    },
    validators: {
      onSubmit: renameOrganizationSchema,
    },
    onSubmit: async ({ value }) => {
      await onRename(value.name)
      setOpen(false)
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <SettingsIcon data-icon="inline-start" />
        Rename
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename organization</DialogTitle>
          <DialogDescription>
            Update the display name for this workspace.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void form.handleSubmit()
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="name">
            {(field) => {
              const isInvalid =
                field.state.meta.isTouched && !field.state.meta.isValid

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>
                    Organization name
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
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

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Renaming...' : 'Save changes'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
