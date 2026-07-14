import { useEffect, useId, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { useForm } from '@tanstack/react-form'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { z } from 'zod'
import { toast } from 'sonner'
import { AppShell } from '#/components/app-shell.tsx'
import { DataTable } from '#/components/data-table.tsx'
import {
  AlertDialog,
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import { ErrorState } from '#/components/error-page.tsx'
import {
  Field,
  FieldDescription,
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
import {
  preloadSettings,
  refetchAppData,
  refetchSettings,
  useSettingsData,
} from '#/db-collections/index.ts'
import { formatDateTime } from '#/lib/format.ts'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import {
  deleteGoogleAnalyticsMapping,
  deleteGoogleAnalyticsProperty,
  deletePartnerApp,
  deletePartnerConnection,
  enqueueUserSync,
  savePartnerApp,
  savePartnerConnection,
  saveGoogleAnalyticsMapping,
  setPartnerAppTestMode,
} from '#/server/app.functions.ts'

export const Route = createFileRoute('/settings/connections')({
  ssr: false,
  codeSplitGroupings: [['loader', 'component']],
  loader: () => preloadSettings(),
  component: ConnectionsSettings,
})

const connectionSchema = z.object({
  name: z.string().min(1, 'Partner account name is required'),
  organizationId: z
    .string()
    .min(1, 'Shopify Partner organization ID is required'),
  token: z.string().min(1, 'Partner API token is required'),
})

const appSchema = z.object({
  connectionId: z.string().min(1, 'Choose a saved Partner account'),
  partnerAppId: z.string().trim().min(1, 'Partner app ID is required'),
})

const googleAnalyticsPropertySchema = z.object({
  propertyId: z
    .string()
    .trim()
    .regex(/^(properties\/)?\d+$/, 'Enter a numeric GA4 property ID'),
  propertyName: z.string().trim().max(100),
  appId: z.string().min(1, 'Choose a Partner app'),
  apiKey: z.string().trim().min(1, 'Shopify app API key is required'),
})

const googleAnalyticsMappingSchema = z.object({
  connectionId: z.string().min(1, 'Choose a GA property'),
  appId: z.string().min(1, 'Choose a Partner app'),
  apiKey: z.string().trim().min(1, 'Shopify app API key is required'),
})

type ConnectedAppRow = {
  id: string
  name: string
  partnerAppId: string
  apiKey: string | null
  connectionName: string | null
  organizationId: string
  isTest: boolean
  lastSyncedAt: string | null
}

type ConnectionRow = {
  id: number
  name: string | null
  organizationId: string
  lastSyncedAt: string | null
  hasManageApps: boolean
  hasViewFinancials: boolean
}

type GoogleAnalyticsConnectionRow = {
  id: number
  propertyId: string
  propertyName: string | null
  lastFetchedAt: string | null
}

type GoogleAnalyticsMappingRow = {
  id: number
  connectionId: number
  propertyId: string
  propertyName: string | null
  appId: string
  appName: string
  apiKey: string
  lastFetchedAt: string | null
}

const HOLD_TO_DELETE_MS = 3_000

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function connectionDisplayName(connection: ConnectionRow) {
  return connection.name ?? `Partner account ${connection.organizationId}`
}

function ConnectionsSettings() {
  const { data, isError } = useSettingsData()
  const [pendingTestAppId, setPendingTestAppId] = useState<string | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const gaConnected = params.get('gaConnected')
    const gaError = params.get('gaError')

    if (!gaConnected && !gaError) return

    if (gaConnected) {
      toast.success(
        params.get('gaMapped')
          ? 'Google Analytics property connected and mapped'
          : 'Google Analytics property connected',
      )
    }
    if (gaError) toast.error(gaError)

    params.delete('gaConnected')
    params.delete('gaMapped')
    params.delete('gaError')
    const nextSearch = params.toString()
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
    window.history.replaceState(null, '', nextUrl)

    void refetchSettings()
  }, [])

  async function onSync(appId: string) {
    await enqueueUserSync({ data: { appId } })
    toast.success('Sync queued')
  }

  async function onToggleAppTestMode(app: ConnectedAppRow) {
    setPendingTestAppId(app.id)

    try {
      await setPartnerAppTestMode({
        data: { appId: app.id, isTest: !app.isTest },
      })
      toast.success(app.isTest ? 'App included in reports' : 'App marked test')
      await refetchAppData()
    } finally {
      setPendingTestAppId(null)
    }
  }

  async function onDeleteApp(app: ConnectedAppRow) {
    setPendingDeleteId(`app:${app.id}`)

    try {
      await deletePartnerApp({ data: { appId: app.id } })
      toast.success('App deleted')
      await refetchAppData()
    } catch (error) {
      toast.error(errorMessage(error, 'App was not deleted'))
    } finally {
      setPendingDeleteId(null)
    }
  }

  async function onDeleteConnection(connection: ConnectionRow) {
    setPendingDeleteId(`connection:${connection.id}`)

    try {
      await deletePartnerConnection({ data: { connectionId: connection.id } })
      toast.success('Partner account deleted')
      await refetchSettings()
    } catch (error) {
      toast.error(errorMessage(error, 'Partner account was not deleted'))
    } finally {
      setPendingDeleteId(null)
    }
  }

  async function onDeleteGoogleAnalyticsConnection(
    connection: GoogleAnalyticsConnectionRow,
  ) {
    setPendingDeleteId(`ga-connection:${connection.id}`)

    try {
      await deleteGoogleAnalyticsProperty({
        data: { connectionId: connection.id },
      })
      toast.success('Google Analytics property deleted')
      await refetchSettings()
    } catch (error) {
      toast.error(
        errorMessage(error, 'Google Analytics property was not deleted'),
      )
    } finally {
      setPendingDeleteId(null)
    }
  }

  async function onDeleteGoogleAnalyticsMapping(
    mapping: GoogleAnalyticsMappingRow,
  ) {
    setPendingDeleteId(`ga-mapping:${mapping.id}`)

    try {
      await deleteGoogleAnalyticsMapping({ data: { mappingId: mapping.id } })
      toast.success('App Store analytics mapping deleted')
      await refetchSettings()
    } catch (error) {
      toast.error(
        errorMessage(error, 'App Store analytics mapping was not deleted'),
      )
    } finally {
      setPendingDeleteId(null)
    }
  }

  if (isError) {
    return (
      <AppShell title="Connections">
        <ErrorState
          statusCode="Error"
          title="Connections did not load"
          description="Refresh the settings data and try again."
          actions={
            <Button type="button" onClick={() => void refetchSettings()}>
              Retry
            </Button>
          }
        />
      </AppShell>
    )
  }

  if (!data) {
    return <AppShell title="Connections">Loading...</AppShell>
  }

  const hasPartnerAccounts = data.connections.length > 0
  const hasApps = data.apps.length > 0

  if (!hasPartnerAccounts) {
    return (
      <AppShell
        title="Connections"
        description="Connect a Shopify Partner account to start analyzing your app data."
        apps={data.apps}
      >
        <Empty className="rounded-xl border bg-muted/20">
          <EmptyHeader>
            <EmptyTitle>Connect your Shopify Partner account</EmptyTitle>
            <EmptyDescription>
              MetricsDock reads installs, subscriptions, and payouts from the
              Shopify Partner API. Add a Partner organization to get started —
              you&apos;ll need a token with Manage apps and View financials.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <AddPartnerAccountDialog hasPartnerAccounts={false} />
          </EmptyContent>
        </Empty>
      </AppShell>
    )
  }

  if (!hasApps) {
    return (
      <AppShell
        title="Connections"
        description="Add the Partner apps you want MetricsDock to analyze."
        apps={data.apps}
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <Empty className="rounded-xl border bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>Add your first app</EmptyTitle>
              <EmptyDescription>
                Your Partner account is connected. Add a Partner app ID to start
                syncing its installs, revenue, and churn.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddPartnerAppDialog connections={data.connections} />
            </EmptyContent>
          </Empty>
          <PartnerAccountsCard
            connections={data.connections}
            pendingDeleteId={pendingDeleteId}
            onDeleteConnection={onDeleteConnection}
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title="Connections"
      description="Apps MetricsDock analyzes and the Partner accounts they sync from."
      apps={data.apps}
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Connected apps</CardTitle>
              <CardDescription>
                Apps MetricsDock is analyzing from your Partner accounts.
              </CardDescription>
              <CardAction>
                <AddPartnerAppDialog connections={data.connections} />
              </CardAction>
            </CardHeader>
            <CardContent>
              <ConnectedAppsTable
                apps={data.apps}
                pendingTestAppId={pendingTestAppId}
                pendingDeleteId={pendingDeleteId}
                onSync={onSync}
                onToggleTestMode={onToggleAppTestMode}
                onDeleteApp={onDeleteApp}
              />
            </CardContent>
          </Card>

          <GoogleAnalyticsCard
            apps={data.apps}
            connections={data.googleAnalyticsConnections}
            mappings={data.googleAnalyticsAppMappings}
            pendingDeleteId={pendingDeleteId}
            onDeleteConnection={onDeleteGoogleAnalyticsConnection}
            onDeleteMapping={onDeleteGoogleAnalyticsMapping}
          />
        </div>

        <PartnerAccountsCard
          connections={data.connections}
          pendingDeleteId={pendingDeleteId}
          onDeleteConnection={onDeleteConnection}
        />
      </div>
    </AppShell>
  )
}

function GoogleAnalyticsCard({
  apps,
  connections,
  mappings,
  pendingDeleteId,
  onDeleteConnection,
  onDeleteMapping,
}: {
  apps: ConnectedAppRow[]
  connections: GoogleAnalyticsConnectionRow[]
  mappings: GoogleAnalyticsMappingRow[]
  pendingDeleteId: string | null
  onDeleteConnection: (
    connection: GoogleAnalyticsConnectionRow,
  ) => Promise<void>
  onDeleteMapping: (mapping: GoogleAnalyticsMappingRow) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Google Analytics App Store</CardTitle>
        <CardDescription>
          GA4 properties mapped to Shopify App Store listing analytics.
        </CardDescription>
        <CardAction className="flex flex-wrap gap-2">
          <AddGoogleAnalyticsPropertyDialog
            apps={apps}
            hasProperties={connections.length > 0}
          />
          {connections.length ? (
            <AddGoogleAnalyticsMappingDialog
              apps={apps}
              connections={connections}
            />
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {connections.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {connections.map((connection) => (
              <div
                key={connection.id}
                className="flex min-w-0 flex-col gap-3 rounded-lg bg-muted/30 p-3 ring-1 ring-border/70"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {googleAnalyticsPropertyName(connection)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Property {connection.propertyId}
                  </div>
                </div>
                <span className="text-sm text-muted-foreground">
                  Last fetch:{' '}
                  {connection.lastFetchedAt
                    ? formatDateTime(connection.lastFetchedAt)
                    : 'never'}
                </span>
                <DeleteConfirmationDialog
                  title="Delete Google Analytics property?"
                  description={`${googleAnalyticsPropertyName(connection)} and its app mappings will be removed from this workspace.`}
                  targetName={connection.propertyId}
                  confirmationLabel="GA property ID"
                  confirmLabel="Hold 3s to delete property"
                  pending={pendingDeleteId === `ga-connection:${connection.id}`}
                  onConfirm={() => onDeleteConnection(connection)}
                  trigger={
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={pendingDeleteId !== null}
                      className="self-start"
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Delete
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        ) : (
          <Empty className="rounded border bg-muted/20">
            <EmptyHeader>
              <EmptyTitle>Connect a GA4 property</EmptyTitle>
              <EmptyDescription>
                Enter the GA4 property ID used on the Shopify App Store listing.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <AddGoogleAnalyticsPropertyDialog
                apps={apps}
                hasProperties={false}
              />
            </EmptyContent>
          </Empty>
        )}

        {connections.length ? (
          mappings.length ? (
            <GoogleAnalyticsMappingsTable
              mappings={mappings}
              pendingDeleteId={pendingDeleteId}
              onDeleteMapping={onDeleteMapping}
            />
          ) : (
            <Empty className="rounded border bg-muted/20">
              <EmptyHeader>
                <EmptyTitle>Map GA to an app</EmptyTitle>
                <EmptyDescription>
                  Choose which connected app should use each GA4 property.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <AddGoogleAnalyticsMappingDialog
                  apps={apps}
                  connections={connections}
                />
              </EmptyContent>
            </Empty>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

function AddGoogleAnalyticsPropertyDialog({
  apps,
  hasProperties,
}: {
  apps: ConnectedAppRow[]
  hasProperties: boolean
}) {
  const [open, setOpen] = useState(false)
  const defaultApp = apps.at(0)
  const form = useForm({
    defaultValues: {
      propertyId: '',
      propertyName: '',
      appId: defaultApp?.id ?? '',
      apiKey: defaultApp?.apiKey ?? '',
    },
    validators: {
      onSubmit: googleAnalyticsPropertySchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const response = await fetch('/api/google-analytics/oauth/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            propertyId: value.propertyId.replace(/^properties\//, ''),
            propertyName: value.propertyName.trim(),
            appId: value.appId,
            apiKey: value.apiKey.trim(),
          }),
        })
        const result = (await response.json().catch(() => ({}))) as {
          url?: string
          error?: string
        }

        if (!response.ok || !result.url) {
          throw new Error(
            result.error ?? 'Google Analytics OAuth could not start.',
          )
        }

        window.location.href = result.url
      } catch (error) {
        toast.error(
          errorMessage(error, 'Google Analytics OAuth could not start.'),
        )
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={hasProperties ? 'outline' : 'default'}
            disabled={!apps.length}
          />
        }
      >
        <PlusIcon data-icon="inline-start" />
        Connect GA property
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect GA4 property</DialogTitle>
          <DialogDescription>
            Connect the property and map it to the app that owns the listing.
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
            <form.Field name="propertyId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      GA4 property ID
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="123456789"
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldDescription>
                      Use the numeric property ID, not the measurement ID.
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            </form.Field>
            <form.Field name="propertyName">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="App Store listing"
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
            <form.Field name="appId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>Partner app</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (!value) return

                        field.handleChange(value)
                        form.setFieldValue(
                          'apiKey',
                          apps.find((app) => app.id === value)?.apiKey ?? '',
                        )
                      }}
                      items={apps.map((app) => ({
                        label: app.name,
                        value: app.id,
                      }))}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={isInvalid}
                      >
                        <SelectValue placeholder="Choose a Partner app" />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {apps.map((app) => (
                            <SelectItem key={app.id} value={app.id}>
                              {app.name}
                            </SelectItem>
                          ))}
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
            <form.Field name="apiKey">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Shopify app API key
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="App API key"
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldDescription>
                      Used to filter Shopify App Store GA events by api_key.
                    </FieldDescription>
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
                  {isSubmitting ? 'Connecting...' : 'Connect with Google'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddGoogleAnalyticsMappingDialog({
  apps,
  connections,
}: {
  apps: ConnectedAppRow[]
  connections: GoogleAnalyticsConnectionRow[]
}) {
  const [open, setOpen] = useState(false)
  const defaultApp = apps.at(0)
  const form = useForm({
    defaultValues: {
      connectionId: connections.at(0)?.id.toString() ?? '',
      appId: defaultApp?.id ?? '',
      apiKey: defaultApp?.apiKey ?? '',
    },
    validators: {
      onSubmit: googleAnalyticsMappingSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await saveGoogleAnalyticsMapping({
          data: {
            connectionId: Number(value.connectionId),
            appId: value.appId,
            apiKey: value.apiKey,
          },
        })

        toast.success('App Store analytics mapping saved')
        await refetchSettings()
        setOpen(false)
      } catch (error) {
        toast.error(
          errorMessage(error, 'App Store analytics mapping was not saved'),
        )
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" disabled={!apps.length} />}
      >
        <PlusIcon data-icon="inline-start" />
        Map app
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Map app listing analytics</DialogTitle>
          <DialogDescription>
            Match a connected Partner app to the GA4 property receiving its App
            Store events.
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
            <form.Field name="connectionId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>GA4 property</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value) field.handleChange(value)
                      }}
                      items={connections.map((connection) => ({
                        label: googleAnalyticsPropertyName(connection),
                        value: connection.id.toString(),
                      }))}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={isInvalid}
                      >
                        <SelectValue placeholder="Choose a GA4 property" />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {connections.map((connection) => (
                            <SelectItem
                              key={connection.id}
                              value={connection.id.toString()}
                            >
                              {googleAnalyticsPropertyName(connection)}
                            </SelectItem>
                          ))}
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

            <form.Field name="appId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel>Partner app</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (!value) return

                        field.handleChange(value)
                        form.setFieldValue(
                          'apiKey',
                          apps.find((app) => app.id === value)?.apiKey ?? '',
                        )
                      }}
                      items={apps.map((app) => ({
                        label: app.name,
                        value: app.id,
                      }))}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-invalid={isInvalid}
                      >
                        <SelectValue placeholder="Choose a Partner app" />
                      </SelectTrigger>
                      <SelectContent alignItemWithTrigger={false}>
                        <SelectGroup>
                          {apps.map((app) => (
                            <SelectItem key={app.id} value={app.id}>
                              {app.name}
                            </SelectItem>
                          ))}
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

            <form.Field name="apiKey">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Shopify app API key
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="App API key"
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                    />
                    <FieldDescription>
                      Used to filter Shopify App Store GA events by api_key.
                    </FieldDescription>
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
                  {isSubmitting ? 'Saving...' : 'Save mapping'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GoogleAnalyticsMappingsTable({
  mappings,
  pendingDeleteId,
  onDeleteMapping,
}: {
  mappings: GoogleAnalyticsMappingRow[]
  pendingDeleteId: string | null
  onDeleteMapping: (mapping: GoogleAnalyticsMappingRow) => Promise<void>
}) {
  const columns: ColumnDef<GoogleAnalyticsMappingRow>[] = [
    {
      accessorKey: 'appName',
      enableSorting: false,
      header: 'App',
    },
    {
      id: 'property',
      accessorFn: (row) => googleAnalyticsPropertyName(row),
      enableSorting: false,
      header: 'GA property',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{googleAnalyticsPropertyName(row.original)}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.propertyId}
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'apiKey',
      enableSorting: false,
      header: 'API key',
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.apiKey}</span>
      ),
    },
    {
      accessorKey: 'lastFetchedAt',
      enableSorting: false,
      header: 'Last fetch',
      cell: ({ row }) =>
        row.original.lastFetchedAt
          ? formatDateTime(row.original.lastFetchedAt)
          : 'never',
    },
    {
      id: 'actions',
      enableSorting: false,
      header: 'Actions',
      cell: ({ row }) => (
        <DeleteConfirmationDialog
          title="Delete App Store analytics mapping?"
          description={`The GA mapping for ${row.original.appName} will be removed.`}
          targetName={row.original.appName}
          confirmationLabel="App name"
          confirmLabel="Hold 3s to delete mapping"
          pending={pendingDeleteId === `ga-mapping:${row.original.id}`}
          onConfirm={() => onDeleteMapping(row.original)}
          trigger={
            <Button
              type="button"
              variant="destructive"
              disabled={pendingDeleteId !== null}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          }
        />
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={mappings}
      emptyMessage="No GA mappings yet."
      sortParam="gaMappingSort"
    />
  )
}

function googleAnalyticsPropertyName({
  propertyId,
  propertyName,
}: {
  propertyId: string
  propertyName: string | null
}) {
  return propertyName ?? `GA property ${propertyId}`
}

function PartnerAccountsCard({
  connections,
  pendingDeleteId,
  onDeleteConnection,
}: {
  connections: ConnectionRow[]
  pendingDeleteId: string | null
  onDeleteConnection: (connection: ConnectionRow) => Promise<void>
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Partner accounts</CardTitle>
        <CardDescription>Saved accounts and API permissions.</CardDescription>
        <CardAction>
          <AddPartnerAccountDialog hasPartnerAccounts />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3 ring-1 ring-border/70"
          >
            <div>
              <div className="font-medium">
                {connection.name ?? 'Partner account'}
              </div>
              <div className="text-sm text-muted-foreground">
                {connection.organizationId}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant={connection.hasManageApps ? 'success' : 'warning'}>
                {connection.hasManageApps
                  ? 'Manage apps'
                  : 'Missing Manage apps'}
              </Badge>
              <Badge
                variant={connection.hasViewFinancials ? 'success' : 'warning'}
              >
                {connection.hasViewFinancials
                  ? 'View financials'
                  : 'Missing View financials'}
              </Badge>
            </div>
            <span className="text-sm text-muted-foreground">
              Last sync:{' '}
              {connection.lastSyncedAt
                ? formatDateTime(connection.lastSyncedAt)
                : 'never'}
            </span>
            <DeleteConfirmationDialog
              title="Delete Partner account?"
              description={`This will delete ${connectionDisplayName(connection)} and all apps connected to it.`}
              targetName={connectionDisplayName(connection)}
              confirmationLabel="Partner account name"
              confirmLabel="Hold 3s to delete account"
              pending={pendingDeleteId === `connection:${connection.id}`}
              onConfirm={() => onDeleteConnection(connection)}
              trigger={
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={pendingDeleteId !== null}
                  className="self-start"
                >
                  <Trash2Icon data-icon="inline-start" />
                  Delete
                </Button>
              }
            />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AddPartnerAccountDialog({
  hasPartnerAccounts,
}: {
  hasPartnerAccounts: boolean
}) {
  const [open, setOpen] = useState(false)
  const form = useForm({
    defaultValues: {
      name: '',
      organizationId: '',
      token: '',
    },
    validators: {
      onSubmit: connectionSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await savePartnerConnection({ data: value })

        form.reset()
        toast.success('Partner account saved')
        await refetchSettings()
        setOpen(false)
      } catch (error) {
        toast.error(errorMessage(error, 'Partner account was not saved'))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={hasPartnerAccounts ? 'outline' : 'default'} />}
      >
        <PlusIcon data-icon="inline-start" />
        Add Partner account
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Partner account</DialogTitle>
          <DialogDescription>
            Connect a Shopify Partner organization so MetricsDock can sync app
            and revenue data. The token needs Manage apps and View financials.
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
            <form.Field name="name">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Partner account name
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="Production org"
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
            <form.Field name="organizationId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Shopify Partner organization ID
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="1234567"
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
            <form.Field name="token">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Partner API token
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
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
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <form.Subscribe
              selector={(state) => [state.canSubmit, state.isSubmitting]}
            >
              {([canSubmit, isSubmitting]) => (
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting ? 'Saving...' : 'Save Partner account'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddPartnerAppDialog({
  connections,
}: {
  connections: ConnectionRow[]
}) {
  const [open, setOpen] = useState(false)
  const defaultConnectionId = connections.at(0)?.id.toString() ?? ''
  const form = useForm({
    defaultValues: {
      connectionId: defaultConnectionId,
      partnerAppId: '',
    },
    validators: {
      onSubmit: appSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await savePartnerApp({
          data: {
            mode: 'existing',
            connectionId: Number(value.connectionId),
            partnerAppId: formatShopifyId(value.partnerAppId, ''),
          },
        })

        form.reset()
        toast.success('App connected')
        await refetchAppData()
        setOpen(false)
      } catch (error) {
        toast.error(errorMessage(error, 'App was not connected'))
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Add app
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Partner app</DialogTitle>
          <DialogDescription>
            Enter the Partner app ID you want to analyze. Find it in the URL of
            the app&apos;s page in your Partner Dashboard.
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
            {connections.length > 1 ? (
              <form.Field name="connectionId">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel>Partner account</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) => {
                          if (value) field.handleChange(value)
                        }}
                        items={connections.map((connection) => ({
                          label: `${connection.name ?? 'Partner account'} (${connection.organizationId})`,
                          value: connection.id.toString(),
                        }))}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-invalid={isInvalid}
                        >
                          <SelectValue placeholder="Choose a Partner account" />
                        </SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {connections.map((connection) => (
                              <SelectItem
                                key={connection.id}
                                value={connection.id.toString()}
                              >
                                {connection.name ?? 'Partner account'} (
                                {connection.organizationId})
                              </SelectItem>
                            ))}
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
            ) : null}

            <form.Field name="partnerAppId">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Partner app ID</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder="123456789"
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          formatShopifyId(event.target.value, ''),
                        )
                      }
                    />
                    <FieldDescription>
                      The selected Partner account needs Manage apps permission.
                    </FieldDescription>
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
                  {isSubmitting ? 'Saving...' : 'Add app'}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConnectedAppsTable({
  apps,
  pendingTestAppId,
  pendingDeleteId,
  onSync,
  onToggleTestMode,
  onDeleteApp,
}: {
  apps: ConnectedAppRow[]
  pendingTestAppId: string | null
  pendingDeleteId: string | null
  onSync: (appId: string) => Promise<void>
  onToggleTestMode: (app: ConnectedAppRow) => Promise<void>
  onDeleteApp: (app: ConnectedAppRow) => Promise<void>
}) {
  const columns: ColumnDef<ConnectedAppRow>[] = [
    {
      accessorKey: 'name',
      enableSorting: false,
      header: 'App',
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-2">
          <span>{row.original.name}</span>
          {row.original.isTest ? <Badge variant="warning">Test</Badge> : null}
        </div>
      ),
    },
    {
      id: 'connection',
      accessorFn: (row) =>
        `${row.connectionName ?? 'Partner account'} (${row.organizationId})`,
      enableSorting: false,
      header: 'Partner account',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span>{row.original.connectionName ?? 'Partner account'}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.organizationId}
          </span>
        </div>
      ),
    },
    {
      id: 'partnerAppId',
      accessorFn: (row) => formatShopifyId(row.partnerAppId),
      enableSorting: false,
      header: 'Partner app ID',
    },
    {
      accessorKey: 'lastSyncedAt',
      enableSorting: false,
      header: 'Last sync',
      cell: ({ row }) =>
        row.original.lastSyncedAt
          ? formatDateTime(row.original.lastSyncedAt)
          : 'started',
    },
    {
      id: 'actions',
      enableSorting: false,
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={row.original.isTest ? 'secondary' : 'outline'}
            aria-pressed={row.original.isTest}
            disabled={
              pendingTestAppId === row.original.id || pendingDeleteId !== null
            }
            onClick={() => void onToggleTestMode(row.original)}
          >
            {pendingTestAppId === row.original.id
              ? 'Saving...'
              : row.original.isTest
                ? 'Include in reports'
                : 'Mark as test'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void onSync(row.original.id)}
            disabled={pendingDeleteId !== null}
          >
            Sync
          </Button>
          <DeleteConfirmationDialog
            title="Delete app?"
            description={`${row.original.name} and its synced app data will be deleted from this workspace.`}
            targetName={row.original.name}
            confirmationLabel="App name"
            confirmLabel="Hold 3s to delete app"
            pending={pendingDeleteId === `app:${row.original.id}`}
            onConfirm={() => onDeleteApp(row.original)}
            trigger={
              <Button
                type="button"
                variant="destructive"
                disabled={pendingDeleteId !== null}
              >
                <Trash2Icon data-icon="inline-start" />
                Delete
              </Button>
            }
          />
        </div>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={apps}
      emptyMessage="No apps connected yet."
    />
  )
}

function DeleteConfirmationDialog({
  title,
  description,
  targetName,
  confirmationLabel,
  confirmLabel,
  pending,
  trigger,
  onConfirm,
}: {
  title: string
  description: string
  targetName: string
  confirmationLabel: string
  confirmLabel: string
  pending: boolean
  trigger: ReactElement
  onConfirm: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [checked, setChecked] = useState(false)
  const [holding, setHolding] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const canDelete = typedName === targetName && checked && !pending
  const inputId = useId()

  function resetConfirmation() {
    setTypedName('')
    setChecked(false)
    setHolding(false)
  }

  function cancelHold() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setHolding(false)
  }

  function startHold() {
    if (!canDelete || timerRef.current) return

    setHolding(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setHolding(false)
      void onConfirm().then(() => {
        setOpen(false)
        resetConfirmation()
      })
    }, HOLD_TO_DELETE_MS)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        cancelHold()
        if (!nextOpen) resetConfirmation()
      }}
    >
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor={`${inputId}-name`}>
              {confirmationLabel}
            </FieldLabel>
            <Input
              id={`${inputId}-name`}
              value={typedName}
              placeholder={targetName}
              disabled={pending}
              onChange={(event) => setTypedName(event.target.value)}
            />
            <FieldDescription>
              Type <span className="font-medium">{targetName}</span> exactly.
            </FieldDescription>
          </Field>
          <Field orientation="horizontal">
            <input
              id={`${inputId}-confirm`}
              type="checkbox"
              role="checkbox"
              className="size-4"
              checked={checked}
              disabled={pending}
              onChange={(event) => setChecked(event.target.checked)}
            />
            <FieldLabel htmlFor={`${inputId}-confirm`}>
              I understand this cannot be undone.
            </FieldLabel>
          </Field>
        </FieldGroup>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!canDelete}
            className="relative overflow-hidden bg-destructive/70 text-destructive-foreground hover:bg-destructive/70 focus-visible:ring-destructive/30"
            onPointerDown={startHold}
            onPointerUp={cancelHold}
            onPointerCancel={cancelHold}
            onPointerLeave={cancelHold}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              startHold()
            }}
            onKeyUp={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              cancelHold()
            }}
            onClick={(event) => event.preventDefault()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 bg-destructive transition-[width] ease-linear"
              style={{
                width: holding ? '100%' : '0%',
                transitionDuration: holding ? `${HOLD_TO_DELETE_MS}ms` : '0ms',
              }}
            />
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Trash2Icon data-icon="inline-start" />
              {pending ? 'Deleting...' : confirmLabel}
            </span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
