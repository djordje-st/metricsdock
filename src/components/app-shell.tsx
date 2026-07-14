import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ActivityIcon,
  ChartColumnIcon,
  Building2Icon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  PlugZapIcon,
  StoreIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { ShopSearch } from '#/components/shop-search.tsx'
import { ThemeSwitcher } from '#/components/theme-switcher.tsx'
import { MetricsDockLogo } from '#/components/metricsdock-logo.tsx'
import {
  addAppShellPasskey,
  AppShellSettingsSync,
  signOutFromAppShell,
  switchAppShellOrganization,
  useAppShellSidebarApps,
  useOrganizationSwitcherData,
} from '#/lib/app-shell.ts'
import type { AppShellApp } from '#/lib/app-shell.ts'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import { cn } from '#/lib/utils.ts'
import { Button } from '#/components/ui/button.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu.tsx'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '#/components/ui/sidebar.tsx'

const navGroups = [
  {
    label: 'Workspace',
    items: [{ label: 'Overview', to: '/dashboard', icon: LayoutDashboardIcon }],
  },
  {
    label: 'Reports',
    items: [
      { label: 'Revenue', to: '/reports/revenue', icon: CircleDollarSignIcon },
      { label: 'Customers', to: '/reports/customers', icon: UsersIcon },
      { label: 'Churn', to: '/reports/churn', icon: ActivityIcon },
      {
        label: 'Google Analytics',
        to: '/reports/app-store',
        icon: ChartColumnIcon,
      },
    ],
  },
] as const

const settingsNavGroup = {
  label: 'Settings',
  items: [
    {
      label: 'Connections',
      to: '/settings/connections',
      icon: PlugZapIcon,
    },
    {
      label: 'Organizations',
      to: '/settings/organizations',
      icon: Building2Icon,
    },
  ],
} as const

type ReportAppFilter = {
  selectedAppIds?: string[]
  onChange: (appIds: string[]) => void
}

async function signOut() {
  try {
    await signOutFromAppShell()
  } finally {
    window.location.href = '/login'
  }
}

async function addPasskey() {
  const result = await addAppShellPasskey()

  if (result.error) {
    toast.error(result.error.message ?? 'Passkey setup failed')
    return
  }

  toast.success('Passkey added')
}

function OrganizationSwitcher() {
  const { organizations, activeOrganization } = useOrganizationSwitcherData()
  const [isSwitching, setIsSwitching] = useState(false)

  async function switchOrganization(organizationId: string) {
    setIsSwitching(true)

    try {
      const result = await switchAppShellOrganization(organizationId)

      if (result.error) {
        toast.error(result.error.message ?? 'Organization switch failed')
        return
      }

      window.location.href = '/dashboard'
    } finally {
      setIsSwitching(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton tooltip="Organization" />}
      >
        <Building2Icon />
        <span className="min-w-0 flex-1 truncate">
          {activeOrganization?.name ?? 'Organization'}
        </span>
        <ChevronDownIcon className="ml-auto shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {organizations.map((organization) => (
            <DropdownMenuCheckboxItem
              key={organization.id}
              checked={organization.id === activeOrganization?.id}
              disabled={isSwitching}
              onClick={() => void switchOrganization(organization.id)}
            >
              <span className="truncate">{organization.name}</span>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/settings/organizations" />}>
          <Building2Icon />
          Manage organizations
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppShell({
  title,
  description = 'Analytics for your Shopify apps, built on the Partner API.',
  apps,
  reportAppFilter,
  headerActions,
  children,
}: {
  title: string
  description?: string
  apps?: AppShellApp[]
  reportAppFilter?: ReportAppFilter
  headerActions?: React.ReactNode
  children: React.ReactNode
}) {
  const { reportApps, sidebarApps, handleSettingsAppsChange } =
    useAppShellSidebarApps(apps)
  const reportAppIds = reportAppFilter?.selectedAppIds?.length
    ? reportAppFilter.selectedAppIds
    : undefined

  return (
    <SidebarProvider>
      {apps === undefined ? (
        <AppShellSettingsSync onAppsChange={handleSettingsAppsChange} />
      ) : null}

      <Sidebar variant="inset" collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                tooltip="MetricsDock"
                render={<Link to="/dashboard" />}
              >
                <MetricsDockLogo />
                <span className="font-heading text-base font-semibold">
                  MetricsDock
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          {navGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        tooltip={item.label}
                        render={
                          group.label === 'Reports' && reportAppIds ? (
                            <Link
                              to={item.to}
                              search={{ appIds: reportAppIds }}
                              activeProps={{
                                className:
                                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                              }}
                            />
                          ) : (
                            <Link
                              to={item.to}
                              activeProps={{
                                className:
                                  'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                              }}
                            />
                          )
                        }
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {sidebarApps.length ? (
            <SidebarGroup>
              <SidebarGroupLabel>Apps</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {sidebarApps.map((app) => (
                    <SidebarMenuItem key={app.id}>
                      <SidebarMenuButton
                        tooltip={app.name}
                        render={
                          <Link
                            to="/apps/$appId"
                            params={{ appId: formatShopifyId(app.id) }}
                            activeProps={{
                              className:
                                'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                            }}
                          />
                        }
                      >
                        <StoreIcon />
                        <span>{app.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ) : null}

          <SidebarGroup>
            <SidebarGroupLabel>{settingsNavGroup.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {settingsNavGroup.items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      tooltip={item.label}
                      render={
                        <Link
                          to={item.to}
                          activeProps={{
                            className:
                              'bg-sidebar-accent text-sidebar-accent-foreground font-medium',
                          }}
                        />
                      }
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarSeparator />

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <ThemeSwitcher variant="sidebar" />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <OrganizationSwitcher />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<SidebarMenuButton tooltip="Account" />}
                >
                  <UserIcon />
                  <span>Account</span>
                  <ChevronDownIcon className="ml-auto" />
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-48">
                  <DropdownMenuItem onClick={() => void addPasskey()}>
                    <KeyRoundIcon />
                    Add passkey
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void signOut()}>
                    <LogOutIcon />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b bg-background px-4 py-3 md:px-6">
          <SidebarTrigger />
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">
              {title}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <div className="order-last flex w-full flex-wrap items-center gap-2 md:order-none md:w-auto md:flex-nowrap">
            {reportAppFilter && reportApps.length > 1 ? (
              <ReportAppPicker
                apps={reportApps}
                filter={reportAppFilter}
                className="w-44 md:w-52"
              />
            ) : null}
            {headerActions}
            <ShopSearch className="min-w-0 flex-1 md:w-80 md:flex-none" />
          </div>
        </header>

        <main id="main-content" className="flex flex-1">
          <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 p-4 md:p-6">
            {children}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function ReportAppPicker({
  apps,
  className,
  filter,
}: {
  apps: AppShellApp[]
  className?: string
  filter: ReportAppFilter
}) {
  const appIds = apps.map((app) => app.id)
  const selectedFilterAppIds = filter.selectedAppIds?.length
    ? new Set(filter.selectedAppIds)
    : null
  const selectedAppIds = selectedFilterAppIds
    ? appIds.filter((id) => selectedFilterAppIds.has(id))
    : appIds
  const selectedAppIdSet = new Set(selectedAppIds)
  const allSelected = selectedAppIds.length === apps.length
  const selectedApp =
    selectedAppIds.length === 1
      ? apps.find((app) => app.id === selectedAppIds[0])
      : null
  const label = !apps.length
    ? 'No apps'
    : allSelected
      ? 'All apps'
      : selectedApp
        ? selectedApp.name
        : `${selectedAppIds.length} apps`

  function selectApps(nextAppIds: string[]) {
    const nextAppIdSet = new Set(nextAppIds)
    const validAppIds = appIds.filter((id) => nextAppIdSet.has(id))

    if (!validAppIds.length) return

    filter.onChange(validAppIds)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className={cn('justify-start', className)}
            disabled={!apps.length}
            aria-label="Choose reporting apps"
            title="Choose reporting apps"
          />
        }
      >
        <StoreIcon data-icon="inline-start" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Reporting apps</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={allSelected}
            onCheckedChange={() => selectApps(appIds)}
          >
            All apps
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          {apps.map((app) => {
            const checked = selectedAppIdSet.has(app.id)
            const isLastSelected = checked && selectedAppIds.length === 1

            return (
              <DropdownMenuCheckboxItem
                key={app.id}
                checked={checked}
                disabled={isLastSelected}
                onCheckedChange={(nextChecked) => {
                  selectApps(
                    nextChecked
                      ? [...selectedAppIds, app.id]
                      : selectedAppIds.filter((id) => id !== app.id),
                  )
                }}
              >
                <span className="truncate">{app.name}</span>
              </DropdownMenuCheckboxItem>
            )
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
