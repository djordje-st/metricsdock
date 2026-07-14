import { useCallback, useEffect, useState } from 'react'
import {
  clearAppData,
  preloadSettings,
  useSettingsData,
} from '#/db-collections/index.ts'
import { authClient } from '#/lib/auth-client.ts'

export type AppShellApp = {
  id: string
  name: string
}

export type OrganizationSummary = {
  id: string
  name: string
  slug: string
}

export const emptyAppShellApps: AppShellApp[] = []

const organizationContextChangedEvent =
  'metricsdock:organization-context-changed'

let cachedSidebarApps: AppShellApp[] = emptyAppShellApps
let cachedOrganizations: OrganizationSummary[] = []
let cachedActiveOrganization: OrganizationSummary | null = null

export function notifyOrganizationContextChanged() {
  window.dispatchEvent(new Event(organizationContextChangedEvent))
}

export async function clearAppShellData() {
  cachedSidebarApps = emptyAppShellApps
  cachedOrganizations = []
  cachedActiveOrganization = null
  await clearAppData()
}

export async function signOutFromAppShell() {
  await authClient.signOut()
  await clearAppShellData()
}

export function addAppShellPasskey() {
  return authClient.passkey.addPasskey({ name: 'MetricsDock passkey' })
}

export async function switchAppShellOrganization(organizationId: string) {
  const result = await authClient.organization.setActive({ organizationId })

  if (!result.error) {
    await clearAppShellData()
  }

  return result
}

export function useAppShellSidebarApps(routeApps: AppShellApp[] | undefined) {
  const [settingsApps, setSettingsApps] = useState<AppShellApp[] | undefined>(
    () =>
      routeApps === undefined && cachedSidebarApps.length
        ? cachedSidebarApps
        : undefined,
  )
  const handleSettingsAppsChange = useCallback((nextApps: AppShellApp[]) => {
    cachedSidebarApps = nextApps
    setSettingsApps(nextApps)
  }, [])

  useEffect(() => {
    if (routeApps !== undefined) {
      cachedSidebarApps = routeApps
      return
    }

    if (settingsApps !== undefined) {
      cachedSidebarApps = settingsApps
    }
  }, [routeApps, settingsApps])

  return {
    reportApps: routeApps ?? emptyAppShellApps,
    sidebarApps: routeApps ?? settingsApps ?? cachedSidebarApps,
    handleSettingsAppsChange,
  }
}

export function AppShellSettingsSync({
  onAppsChange,
}: {
  onAppsChange: (apps: AppShellApp[]) => void
}) {
  const { data } = useSettingsData()

  useEffect(() => {
    if (data?.apps) onAppsChange(data.apps)
  }, [data?.apps, onAppsChange])

  useEffect(() => {
    if (!data) void preloadSettings()
  }, [data])

  return null
}

export function useOrganizationSwitcherData() {
  const [organizations, setOrganizations] =
    useState<OrganizationSummary[]>(cachedOrganizations)
  const [activeOrganization, setActiveOrganization] =
    useState<OrganizationSummary | null>(cachedActiveOrganization)

  useEffect(() => {
    let isMounted = true

    async function loadOrganizations() {
      const [organizationsResult, activeOrganizationResult] = await Promise.all(
        [
          authClient.organization.list(),
          authClient.organization.getFullOrganization(),
        ],
      )

      if (!isMounted) return

      const nextOrganizations =
        (organizationsResult.data as OrganizationSummary[] | null) ?? []
      const nextActiveOrganization =
        (activeOrganizationResult.data as OrganizationSummary | null) ?? null

      cachedOrganizations = nextOrganizations
      cachedActiveOrganization = nextActiveOrganization
      setOrganizations(nextOrganizations)
      setActiveOrganization(nextActiveOrganization)
    }

    void loadOrganizations()
    window.addEventListener(organizationContextChangedEvent, loadOrganizations)

    return () => {
      isMounted = false
      window.removeEventListener(
        organizationContextChangedEvent,
        loadOrganizations,
      )
    }
  }, [])

  return { organizations, activeOrganization }
}
