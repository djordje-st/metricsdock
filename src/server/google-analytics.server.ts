import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, desc, eq, inArray, or } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '#/db/index.server.ts'
import {
  googleAnalyticsAppMappings,
  googleAnalyticsConnections,
  partnerApps,
  partnerConnections,
} from '#/db/schema.ts'
import {
  normalizeDateRangeSearch,
  parseDateKey,
  toDateKey,
} from '#/lib/date-range.ts'
import { decryptSecret, encryptSecret } from '#/lib/crypto.ts'
import { toPartnerAppGid } from '#/lib/shopify-id.ts'

const googleOAuthScope = 'https://www.googleapis.com/auth/analytics.readonly'
const googleOAuthStateTtlMs = 10 * 60 * 1000

const appStoreEventNames = [
  'view_item',
  'add_to_cart',
  'shopify_app_install',
  'shopify_app_ad_click',
  'Add App button',
  'Open app button',
] as const

type AppStoreEventName = (typeof appStoreEventNames)[number]
type AppStoreEventKind =
  | 'listing_view'
  | 'install_click'
  | 'completed_install'
  | 'ad_click'
  | 'open_app'
  | 'other'

type AppStoreMetricKey =
  | 'listingViews'
  | 'installClicks'
  | 'completedInstalls'
  | 'installClickRate'
  | 'installCompletionRate'

const eventLabels: Record<AppStoreEventName, string> = {
  view_item: 'Listing view',
  add_to_cart: 'Install click',
  shopify_app_install: 'Completed install',
  shopify_app_ad_click: 'Ad click',
  'Add App button': 'Install click',
  'Open app button': 'Open app click',
}

type OAuthState = {
  userId: string
  organizationId: string
  propertyId: string
  propertyName: string | null
  appId: string | null
  encryptedApiKey: string | null
  createdAt: number
}

type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
  error?: string
  error_description?: string
}

type GoogleReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
  error?: {
    message?: string
    status?: string
  }
}

type MappingRow = {
  mappingId: number
  connectionId: number
  propertyId: string
  propertyName: string | null
  encryptedRefreshToken: string
  appId: string
  appName: string
  apiKey: string
}

export type GoogleAnalyticsSettingsConnection = {
  id: number
  propertyId: string
  propertyName: string | null
  lastFetchedAt: string | null
}

export type GoogleAnalyticsSettingsMapping = {
  id: number
  connectionId: number
  propertyId: string
  propertyName: string | null
  appId: string
  appName: string
  apiKey: string
  lastFetchedAt: string | null
}

export type AppStoreAnalyticsRow = {
  id: string
  date: string
  appId: string
  appName: string
  eventName: string
  eventLabel: string
  country: string
  sourceMedium: string
  surfaceType: string
  surfaceDetail: string
  eventCount: number
  activeUsers: number
}

export type AppStoreAnalyticsReport = {
  apps: Array<{ id: string; name: string }>
  metrics: AppStoreMetricTotals
  comparisons: Array<{
    key: AppStoreMetricKey
    label: string
    current: number | null
    previous: number | null
    delta: number | null
    changeRate: number | null
    format: 'number' | 'percent'
  }>
  insights: Array<{
    title: string
    description: string
    tone: 'default' | 'success' | 'warning'
  }>
  recommendations: Array<{
    title: string
    description: string
  }>
  funnelSeries: Array<{
    date: string
    listingViews: number
    installClicks: number
    completedInstalls: number
  }>
  listingViewSeries: Array<{ date: string; value: number }>
  installSeries: Array<{ date: string; value: number }>
  topAttribution: Array<{ name: string; value: number }>
  topCountries: Array<{ name: string; value: number }>
  rows: AppStoreAnalyticsRow[]
  accessIssues: string[]
}

type AppStoreMetricTotals = {
  listingViews: number
  installClicks: number
  completedInstalls: number
  adClicks: number
  openAppClicks: number
  installClickRate: number | null
  installCompletionRate: number | null
}

class GoogleAnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function normalizeGoogleAnalyticsPropertyId(value: string) {
  const propertyId = value.trim().replace(/^properties\//, '')

  return /^\d{1,32}$/.test(propertyId) ? propertyId : null
}

export function buildGoogleAnalyticsOAuthUrl(args: {
  userId: string
  organizationId: string
  propertyId: string
  propertyName?: string | null
  appId?: string | null
  apiKey?: string | null
}) {
  const propertyId = normalizeGoogleAnalyticsPropertyId(args.propertyId)

  if (!propertyId) {
    throw new Error('Google Analytics property ID must be numeric')
  }

  const state = signOAuthState({
    userId: args.userId,
    organizationId: args.organizationId,
    propertyId,
    propertyName: sanitizePropertyName(args.propertyName),
    appId: sanitizeOAuthString(args.appId),
    encryptedApiKey: encryptOAuthStateValue(args.apiKey),
    createdAt: Date.now(),
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')

  url.searchParams.set('client_id', googleClientId())
  url.searchParams.set('redirect_uri', googleRedirectUri())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', googleOAuthScope)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)

  return url.toString()
}

export async function saveGoogleAnalyticsOAuthCallback(args: {
  userId: string
  organizationId: string
  code: string
  state: string
}) {
  const state = verifyOAuthState(args.state)

  if (
    state.userId !== args.userId ||
    state.organizationId !== args.organizationId
  ) {
    throw new Error('Google Analytics OAuth state does not match this session')
  }

  const token = await exchangeAuthorizationCode(args.code)

  if (!token.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Reconnect the property and approve offline access.',
    )
  }

  const [connection] = await db
    .insert(googleAnalyticsConnections)
    .values({
      userId: args.userId,
      authOrganizationId: args.organizationId,
      propertyId: state.propertyId,
      propertyName: state.propertyName,
      encryptedRefreshToken: encryptSecret(token.refresh_token),
      scope: token.scope ?? googleOAuthScope,
    })
    .onConflictDoUpdate({
      target: [
        googleAnalyticsConnections.authOrganizationId,
        googleAnalyticsConnections.propertyId,
      ],
      set: {
        userId: args.userId,
        propertyName: state.propertyName,
        encryptedRefreshToken: encryptSecret(token.refresh_token),
        scope: token.scope ?? googleOAuthScope,
        updatedAt: new Date(),
      },
    })
    .returning({
      id: googleAnalyticsConnections.id,
      propertyId: googleAnalyticsConnections.propertyId,
    })

  if (!state.appId) return { connection, mapping: null }

  const mapping = await saveGoogleAnalyticsAppMapping({
    authOrganizationId: args.organizationId,
    connectionId: connection.id,
    appId: state.appId,
    apiKey: state.encryptedApiKey ? decryptSecret(state.encryptedApiKey) : '',
  })

  if (!mapping) {
    throw new Error(
      'Google Analytics property connected, but app mapping failed.',
    )
  }

  return { connection, mapping }
}

export async function getGoogleAnalyticsSettings(args: {
  authOrganizationId: string
}) {
  const connectionsQuery = db
    .select({
      id: googleAnalyticsConnections.id,
      propertyId: googleAnalyticsConnections.propertyId,
      propertyName: googleAnalyticsConnections.propertyName,
      lastFetchedAt: googleAnalyticsConnections.lastFetchedAt,
    })
    .from(googleAnalyticsConnections)
    .where(
      eq(
        googleAnalyticsConnections.authOrganizationId,
        args.authOrganizationId,
      ),
    )
    .orderBy(desc(googleAnalyticsConnections.createdAt))

  const mappingsQuery = db
    .select({
      id: googleAnalyticsAppMappings.id,
      connectionId: googleAnalyticsConnections.id,
      propertyId: googleAnalyticsConnections.propertyId,
      propertyName: googleAnalyticsConnections.propertyName,
      appId: partnerApps.id,
      appName: partnerApps.name,
      apiKey: googleAnalyticsAppMappings.apiKey,
      lastFetchedAt: googleAnalyticsAppMappings.lastFetchedAt,
    })
    .from(googleAnalyticsAppMappings)
    .innerJoin(
      googleAnalyticsConnections,
      eq(
        googleAnalyticsAppMappings.connectionId,
        googleAnalyticsConnections.id,
      ),
    )
    .innerJoin(
      partnerApps,
      eq(googleAnalyticsAppMappings.appId, partnerApps.id),
    )
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(
      and(
        eq(
          googleAnalyticsAppMappings.authOrganizationId,
          args.authOrganizationId,
        ),
        eq(
          googleAnalyticsConnections.authOrganizationId,
          args.authOrganizationId,
        ),
        eq(partnerConnections.authOrganizationId, args.authOrganizationId),
      ),
    )
    .orderBy(desc(googleAnalyticsAppMappings.createdAt))

  const [connections, mappings] = await Promise.all([
    connectionsQuery,
    mappingsQuery,
  ])

  return {
    googleAnalyticsConnections: connections.map((connection) => ({
      ...connection,
      lastFetchedAt: connection.lastFetchedAt?.toISOString() ?? null,
    })),
    googleAnalyticsAppMappings: mappings.map((mapping) => ({
      ...mapping,
      lastFetchedAt: mapping.lastFetchedAt?.toISOString() ?? null,
    })),
  }
}

export async function saveGoogleAnalyticsAppMapping(args: {
  authOrganizationId: string
  connectionId: number
  appId: string
  apiKey: string
}) {
  const [connection, app] = await Promise.all([
    findGoogleAnalyticsConnection(args.authOrganizationId, args.connectionId),
    findPartnerApp(args.authOrganizationId, args.appId),
  ])

  if (!connection) return null
  if (!app) return null

  const apiKey = (args.apiKey.trim() || app.apiKey || '').trim()

  if (!apiKey) {
    throw new Error('A Shopify app API key is required for GA attribution')
  }

  const [mapping] = await db
    .insert(googleAnalyticsAppMappings)
    .values({
      authOrganizationId: args.authOrganizationId,
      connectionId: connection.id,
      appId: app.id,
      apiKey,
    })
    .onConflictDoUpdate({
      target: [
        googleAnalyticsAppMappings.authOrganizationId,
        googleAnalyticsAppMappings.appId,
      ],
      set: {
        connectionId: connection.id,
        apiKey,
        updatedAt: new Date(),
      },
    })
    .returning({ id: googleAnalyticsAppMappings.id })

  return mapping
}

export async function deleteGoogleAnalyticsAppMapping(args: {
  authOrganizationId: string
  mappingId: number
}) {
  const mappings = await db
    .delete(googleAnalyticsAppMappings)
    .where(
      and(
        eq(
          googleAnalyticsAppMappings.authOrganizationId,
          args.authOrganizationId,
        ),
        eq(googleAnalyticsAppMappings.id, args.mappingId),
      ),
    )
    .returning({ id: googleAnalyticsAppMappings.id })

  return mappings.at(0) ?? null
}

export async function deleteGoogleAnalyticsConnection(args: {
  authOrganizationId: string
  connectionId: number
}) {
  const connections = await db
    .delete(googleAnalyticsConnections)
    .where(
      and(
        eq(
          googleAnalyticsConnections.authOrganizationId,
          args.authOrganizationId,
        ),
        eq(googleAnalyticsConnections.id, args.connectionId),
      ),
    )
    .returning({
      id: googleAnalyticsConnections.id,
      propertyId: googleAnalyticsConnections.propertyId,
      propertyName: googleAnalyticsConnections.propertyName,
    })

  return connections.at(0) ?? null
}

export async function getGoogleAnalyticsAppStoreReport(args: {
  authOrganizationId: string
  appIds?: string[]
  startDate?: string
  endDate?: string
}): Promise<AppStoreAnalyticsReport> {
  const range = normalizeDateRangeSearch(args)
  const previousRange = getPreviousDateRange(range)
  const mappings = await getReportMappings(args)
  const rows: AppStoreAnalyticsRow[] = []
  const previousRows: AppStoreAnalyticsRow[] = []
  const accessIssues: string[] = []

  for (const mapping of mappings) {
    try {
      const result = await fetchMappingRows(mapping, range)
      rows.push(...result.rows)

      if (result.issue) {
        accessIssues.push(`${mapping.appName}: ${result.issue}`)
      }

      await markMappingFetched(mapping)
    } catch (error) {
      accessIssues.push(`${mapping.appName}: ${errorMessage(error)}`)
    }
  }

  for (const mapping of mappings) {
    try {
      const result = await fetchMappingRows(mapping, previousRange)
      previousRows.push(...result.rows)
    } catch (error) {
      accessIssues.push(
        `${mapping.appName}: Previous-period comparison unavailable. ${errorMessage(error)}`,
      )
    }
  }

  return buildReport({
    mappings,
    rows,
    previousRows,
    accessIssues,
    startDate: range.startDate,
    endDate: range.endDate,
  })
}

async function findGoogleAnalyticsConnection(
  authOrganizationId: string,
  connectionId: number,
) {
  return (
    await db
      .select({ id: googleAnalyticsConnections.id })
      .from(googleAnalyticsConnections)
      .where(
        and(
          eq(googleAnalyticsConnections.authOrganizationId, authOrganizationId),
          eq(googleAnalyticsConnections.id, connectionId),
        ),
      )
      .limit(1)
  ).at(0)
}

async function findPartnerApp(authOrganizationId: string, appId: string) {
  return (
    await db
      .select({
        id: partnerApps.id,
        apiKey: partnerApps.apiKey,
      })
      .from(partnerApps)
      .innerJoin(
        partnerConnections,
        eq(partnerApps.connectionId, partnerConnections.id),
      )
      .where(
        and(
          eq(partnerConnections.authOrganizationId, authOrganizationId),
          or(
            eq(partnerApps.id, appId),
            eq(partnerApps.partnerAppId, toPartnerAppGid(appId)),
          ),
        ),
      )
      .limit(1)
  ).at(0)
}

async function getReportMappings(args: {
  authOrganizationId: string
  appIds?: string[]
}) {
  const filters: SQL[] = [
    eq(googleAnalyticsAppMappings.authOrganizationId, args.authOrganizationId),
    eq(googleAnalyticsConnections.authOrganizationId, args.authOrganizationId),
    eq(partnerConnections.authOrganizationId, args.authOrganizationId),
    eq(partnerApps.isTest, false),
  ]
  const appIds = scopedAppIds(args.appIds ?? [])

  if (appIds.length) {
    filters.push(
      or(
        inArray(partnerApps.id, appIds),
        inArray(
          partnerApps.partnerAppId,
          appIds.map((appId) => toPartnerAppGid(appId)),
        ),
      )!,
    )
  }

  return db
    .select({
      mappingId: googleAnalyticsAppMappings.id,
      connectionId: googleAnalyticsConnections.id,
      propertyId: googleAnalyticsConnections.propertyId,
      propertyName: googleAnalyticsConnections.propertyName,
      encryptedRefreshToken: googleAnalyticsConnections.encryptedRefreshToken,
      appId: partnerApps.id,
      appName: partnerApps.name,
      apiKey: googleAnalyticsAppMappings.apiKey,
    })
    .from(googleAnalyticsAppMappings)
    .innerJoin(
      googleAnalyticsConnections,
      eq(
        googleAnalyticsAppMappings.connectionId,
        googleAnalyticsConnections.id,
      ),
    )
    .innerJoin(
      partnerApps,
      eq(googleAnalyticsAppMappings.appId, partnerApps.id),
    )
    .innerJoin(
      partnerConnections,
      eq(partnerApps.connectionId, partnerConnections.id),
    )
    .where(and(...filters))
    .orderBy(partnerApps.name)
}

function scopedAppIds(appIds: string[]) {
  return [
    ...new Set(
      appIds.map((appId) => appId.trim()).filter((appId) => appId.length > 0),
    ),
  ]
}

async function fetchMappingRows(
  mapping: MappingRow,
  range: { startDate: string; endDate: string },
) {
  const accessToken = await refreshAccessToken(
    decryptSecret(mapping.encryptedRefreshToken),
  )

  try {
    const rows = await runAppStoreReport({
      accessToken,
      mapping,
      range,
      includeCustomDimensions: true,
    })

    if (rows.length) {
      return { rows, issue: null }
    }

    const fallbackRows = await runAppStoreReport({
      accessToken,
      mapping,
      range,
      includeCustomDimensions: false,
    })

    if (fallbackRows.length) {
      return {
        rows: fallbackRows,
        issue:
          'No GA events matched this app API key. Showing property-level App Store events for this app mapping.',
      }
    }

    return {
      rows,
      issue: null,
    }
  } catch (error) {
    if (!isCustomDimensionError(error)) throw error

    return {
      rows: await runAppStoreReport({
        accessToken,
        mapping,
        range,
        includeCustomDimensions: false,
      }),
      issue:
        'GA custom dimensions for api_key, surface_type, or surface_detail are missing. Showing property-level events for this app mapping.',
    }
  }
}

async function runAppStoreReport(args: {
  accessToken: string
  mapping: MappingRow
  range: { startDate: string; endDate: string }
  includeCustomDimensions: boolean
}) {
  const dimensions = args.includeCustomDimensions
    ? [
        'date',
        'eventName',
        'country',
        'sessionSource',
        'sessionMedium',
        'customEvent:api_key',
        'customEvent:surface_type',
        'customEvent:surface_detail',
      ]
    : ['date', 'eventName', 'country', 'sessionSource', 'sessionMedium']
  const response = await runGoogleAnalyticsReport({
    accessToken: args.accessToken,
    propertyId: args.mapping.propertyId,
    body: {
      dateRanges: [
        {
          startDate: args.range.startDate,
          endDate: args.range.endDate,
        },
      ],
      dimensions: dimensions.map((name) => ({ name })),
      metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
      dimensionFilter: buildEventFilter({
        apiKey: args.mapping.apiKey,
        includeCustomDimensions: args.includeCustomDimensions,
      }),
      keepEmptyRows: false,
      limit: 10_000,
      orderBys: [{ dimension: { dimensionName: 'date' } }],
    },
  })

  return (response.rows ?? []).flatMap((row, index) => {
    const dimensionValue = (name: string) =>
      row.dimensionValues?.[dimensions.indexOf(name)]?.value ?? ''
    const eventName = dimensionValue('eventName')
    const eventCount = Number(row.metricValues?.[0]?.value ?? 0)
    const activeUsers = Number(row.metricValues?.[1]?.value ?? 0)

    if (!eventCount || !eventName) return []

    const date = normalizeGaDate(dimensionValue('date'))
    const source = cleanDimension(dimensionValue('sessionSource'))
    const medium = cleanDimension(dimensionValue('sessionMedium'))
    const country = cleanDimension(dimensionValue('country')) || 'Unknown'
    const surfaceType = cleanDimension(
      dimensionValue('customEvent:surface_type'),
    )
    const surfaceDetail = cleanDimension(
      dimensionValue('customEvent:surface_detail'),
    )

    return {
      id: [
        args.mapping.mappingId,
        date,
        eventName,
        country,
        source,
        medium,
        surfaceType,
        surfaceDetail,
        index,
      ].join(':'),
      date,
      appId: args.mapping.appId,
      appName: args.mapping.appName,
      eventName,
      eventLabel: eventLabel(eventName),
      country,
      sourceMedium: sourceMediumLabel(source, medium),
      surfaceType: surfaceType || 'Unknown',
      surfaceDetail: surfaceDetail || 'Unknown',
      eventCount,
      activeUsers: Number.isFinite(activeUsers) ? activeUsers : 0,
    } satisfies AppStoreAnalyticsRow
  })
}

function buildEventFilter(args: {
  apiKey: string
  includeCustomDimensions: boolean
}) {
  const eventFilter = {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: [...appStoreEventNames] },
    },
  }

  if (!args.includeCustomDimensions) return eventFilter

  return {
    andGroup: {
      expressions: [
        eventFilter,
        {
          filter: {
            fieldName: 'customEvent:api_key',
            stringFilter: {
              matchType: 'EXACT',
              value: args.apiKey,
            },
          },
        },
      ],
    },
  }
}

async function runGoogleAnalyticsReport(args: {
  accessToken: string
  propertyId: string
  body: Record<string, unknown>
}) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${args.propertyId}:runReport`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args.body),
    },
  )
  const body = (await response.json().catch(() => ({}))) as GoogleReportResponse

  if (!response.ok) {
    throw new GoogleAnalyticsApiError(
      body.error?.message || `Google Analytics request failed`,
      response.status,
    )
  }

  return body
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: googleClientId(),
    client_secret: googleClientSecret(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const token = (await response.json().catch(() => ({}))) as GoogleTokenResponse

  if (!response.ok || !token.access_token) {
    throw new Error(
      token.error_description || token.error || 'Google token refresh failed',
    )
  }

  return token.access_token
}

async function exchangeAuthorizationCode(code: string) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  const token = (await response.json().catch(() => ({}))) as GoogleTokenResponse

  if (!response.ok) {
    throw new Error(
      token.error_description || token.error || 'Google OAuth failed',
    )
  }

  return token
}

async function markMappingFetched(mapping: MappingRow) {
  const now = new Date()

  await Promise.all([
    db
      .update(googleAnalyticsAppMappings)
      .set({ lastFetchedAt: now, updatedAt: now })
      .where(eq(googleAnalyticsAppMappings.id, mapping.mappingId)),
    db
      .update(googleAnalyticsConnections)
      .set({ lastFetchedAt: now, updatedAt: now })
      .where(eq(googleAnalyticsConnections.id, mapping.connectionId)),
  ])
}

function buildReport(args: {
  mappings: MappingRow[]
  rows: AppStoreAnalyticsRow[]
  previousRows: AppStoreAnalyticsRow[]
  accessIssues: string[]
  startDate: string
  endDate: string
}): AppStoreAnalyticsReport {
  const byDate = new Map(
    dateKeys(args.startDate, args.endDate).map((date) => [
      date,
      {
        date,
        listingViews: 0,
        addToCartClicks: 0,
        legacyInstallClicks: 0,
        completedInstalls: 0,
      },
    ]),
  )
  const countryRows: AppStoreAnalyticsRow[] = []
  const attributionRows: AppStoreAnalyticsRow[] = []
  let listingViews = 0
  let addToCartClicks = 0
  let legacyInstallClicks = 0
  let completedInstalls = 0
  let adClicks = 0
  let openAppClicks = 0

  for (const row of args.rows) {
    const kind = eventKind(row.eventName)
    const day = byDate.get(row.date)

    if (kind === 'listing_view') {
      listingViews += row.eventCount
      if (day) day.listingViews += row.eventCount
      countryRows.push(row)
      attributionRows.push(row)
    } else if (row.eventName === 'add_to_cart') {
      addToCartClicks += row.eventCount
      if (day) day.addToCartClicks += row.eventCount
      attributionRows.push(row)
    } else if (row.eventName === 'Add App button') {
      legacyInstallClicks += row.eventCount
      if (day) day.legacyInstallClicks += row.eventCount
      attributionRows.push(row)
    } else if (kind === 'completed_install') {
      completedInstalls += row.eventCount
      if (day) day.completedInstalls += row.eventCount
      countryRows.push(row)
      attributionRows.push(row)
    } else if (kind === 'ad_click') {
      adClicks += row.eventCount
      attributionRows.push(row)
    } else if (kind === 'open_app') {
      openAppClicks += row.eventCount
    }
  }

  const installClicks = addToCartClicks || legacyInstallClicks
  const funnelSeries = [...byDate.values()].map((day) => ({
    date: day.date,
    listingViews: day.listingViews,
    installClicks: day.addToCartClicks || day.legacyInstallClicks,
    completedInstalls: day.completedInstalls,
  }))
  const apps = [
    ...new Map(
      args.mappings.map((mapping) => [
        mapping.appId,
        { id: mapping.appId, name: mapping.appName },
      ]),
    ).values(),
  ]
  const metrics: AppStoreMetricTotals = {
    listingViews,
    installClicks,
    completedInstalls,
    adClicks,
    openAppClicks,
    installClickRate: rate(installClicks, listingViews),
    installCompletionRate: rate(completedInstalls, installClicks),
  }
  const previousMetrics = summarizeMetricTotals(args.previousRows)
  const topAttribution = rankedByCount(
    attributionRows.length ? attributionRows : args.rows,
    attributionLabel,
  )
  const topCountries = rankedByCount(
    countryRows.length ? countryRows : args.rows,
    (row) => row.country,
  )

  return {
    apps,
    metrics,
    comparisons: buildMetricComparisons(metrics, previousMetrics),
    insights: buildAppStoreInsights({
      metrics,
      previousMetrics,
      topAttribution,
      topCountries,
      accessIssues: args.accessIssues,
    }),
    recommendations: buildRecommendations({
      metrics,
      topCountries,
      accessIssues: args.accessIssues,
    }),
    funnelSeries,
    listingViewSeries: funnelSeries.map((point) => ({
      date: point.date,
      value: point.listingViews,
    })),
    installSeries: funnelSeries.map((point) => ({
      date: point.date,
      value: point.completedInstalls,
    })),
    topAttribution,
    topCountries,
    rows: [...args.rows].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.eventCount - a.eventCount ||
        a.appName.localeCompare(b.appName),
    ),
    accessIssues: [...new Set(args.accessIssues)],
  }
}

function rankedByCount(
  rows: AppStoreAnalyticsRow[],
  labelFor: (row: AppStoreAnalyticsRow) => string,
) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const label = labelFor(row)
    counts.set(label, (counts.get(label) ?? 0) + row.eventCount)
  }

  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, 8)
}

function summarizeMetricTotals(rows: AppStoreAnalyticsRow[]) {
  let listingViews = 0
  let addToCartClicks = 0
  let legacyInstallClicks = 0
  let completedInstalls = 0
  let adClicks = 0
  let openAppClicks = 0

  for (const row of rows) {
    const kind = eventKind(row.eventName)

    if (kind === 'listing_view') {
      listingViews += row.eventCount
    } else if (row.eventName === 'add_to_cart') {
      addToCartClicks += row.eventCount
    } else if (row.eventName === 'Add App button') {
      legacyInstallClicks += row.eventCount
    } else if (kind === 'completed_install') {
      completedInstalls += row.eventCount
    } else if (kind === 'ad_click') {
      adClicks += row.eventCount
    } else if (kind === 'open_app') {
      openAppClicks += row.eventCount
    }
  }

  const installClicks = addToCartClicks || legacyInstallClicks

  return {
    listingViews,
    installClicks,
    completedInstalls,
    adClicks,
    openAppClicks,
    installClickRate: rate(installClicks, listingViews),
    installCompletionRate: rate(completedInstalls, installClicks),
  } satisfies AppStoreMetricTotals
}

function buildMetricComparisons(
  metrics: AppStoreMetricTotals,
  previousMetrics: AppStoreMetricTotals,
): AppStoreAnalyticsReport['comparisons'] {
  const metricDefinitions: Array<{
    key: AppStoreMetricKey
    label: string
    format: 'number' | 'percent'
  }> = [
    { key: 'listingViews', label: 'Listing views', format: 'number' },
    { key: 'installClicks', label: 'Install clicks', format: 'number' },
    { key: 'completedInstalls', label: 'Completed installs', format: 'number' },
    { key: 'installClickRate', label: 'View-to-click rate', format: 'percent' },
    {
      key: 'installCompletionRate',
      label: 'Click-to-install rate',
      format: 'percent',
    },
  ]

  return metricDefinitions.map(({ key, label, format }) => {
    const current = metrics[key]
    const previous = previousMetrics[key]
    const delta =
      current === null || previous === null ? null : current - previous
    const changeRate =
      delta === null || previous === null || previous === 0
        ? null
        : delta / previous

    return { key, label, current, previous, delta, changeRate, format }
  })
}

function buildAppStoreInsights(args: {
  metrics: AppStoreMetricTotals
  previousMetrics: AppStoreMetricTotals
  topAttribution: Array<{ name: string; value: number }>
  topCountries: Array<{ name: string; value: number }>
  accessIssues: string[]
}): AppStoreAnalyticsReport['insights'] {
  const insights: AppStoreAnalyticsReport['insights'] = []
  const clickRate = args.metrics.installClickRate
  const completionRate = args.metrics.installCompletionRate

  if (!args.metrics.listingViews) {
    insights.push({
      title: 'No listing traffic in this range',
      description:
        'Widen the date range or confirm the App Store listing is sending events before judging performance.',
      tone: 'warning',
    })
  } else if (clickRate !== null && clickRate < 0.08) {
    insights.push({
      title: 'The listing is getting views, but install intent is low',
      description:
        'The first impression is not convincing many visitors to click install.',
      tone: 'warning',
    })
  } else if (clickRate !== null && clickRate >= 0.15) {
    insights.push({
      title: 'The listing is converting views into install intent',
      description:
        'A healthy share of listing visitors are clicking through to install.',
      tone: 'success',
    })
  } else {
    insights.push({
      title: 'Listing conversion is steady',
      description:
        'Views are turning into install clicks at a moderate rate for this date range.',
      tone: 'default',
    })
  }

  if (
    args.metrics.installClicks > 0 &&
    completionRate !== null &&
    completionRate < 0.7
  ) {
    insights.push({
      title: 'Install intent is not fully turning into installs',
      description:
        'Users click install, but a smaller share complete the flow afterward.',
      tone: 'warning',
    })
  } else if (args.metrics.completedInstalls > 0) {
    insights.push({
      title: 'Completed installs are following install clicks',
      description:
        'The install flow is not showing a major drop after visitors click install.',
      tone: 'success',
    })
  }

  const installDelta =
    args.metrics.completedInstalls - args.previousMetrics.completedInstalls

  if (
    args.previousMetrics.completedInstalls > 0 &&
    Math.abs(installDelta / args.previousMetrics.completedInstalls) >= 0.1
  ) {
    insights.push({
      title:
        installDelta > 0
          ? 'Completed installs increased from the previous period'
          : 'Completed installs decreased from the previous period',
      description:
        installDelta > 0
          ? 'Recent listing traffic is producing more installs than the prior matching window.'
          : 'The listing produced fewer installs than the prior matching window.',
      tone: installDelta > 0 ? 'success' : 'warning',
    })
  }

  const topSource = args.topAttribution.at(0)

  if (topSource) {
    insights.push({
      title: `${topSource.name} is the strongest source`,
      description:
        'Prioritize this channel when reviewing listing changes and traffic quality.',
      tone: 'default',
    })
  }

  const topCountry = args.topCountries.at(0)

  if (topCountry) {
    insights.push({
      title: `${topCountry.name} is the strongest market`,
      description:
        'Use this country signal when deciding what screenshots, copy, and support details to localize first.',
      tone: 'default',
    })
  }

  return insights.slice(0, 5)
}

function buildRecommendations(args: {
  metrics: AppStoreMetricTotals
  topCountries: Array<{ name: string; value: number }>
  accessIssues: string[]
}): AppStoreAnalyticsReport['recommendations'] {
  const recommendations: AppStoreAnalyticsReport['recommendations'] = []
  const clickRate = args.metrics.installClickRate
  const completionRate = args.metrics.installCompletionRate

  if (!args.metrics.listingViews) {
    recommendations.push({
      title: 'Confirm tracking before optimizing the listing',
      description:
        'No listing views were found in this range, so there is not enough traffic to diagnose conversion.',
    })
  } else if (clickRate !== null && clickRate < 0.08) {
    recommendations.push({
      title: 'Improve the listing first impression',
      description:
        'Review the icon, headline, first screenshot, pricing clarity, and opening copy because visitors are not clicking install often enough.',
    })
  }

  if (
    args.metrics.installClicks > 0 &&
    completionRate !== null &&
    completionRate < 0.7
  ) {
    recommendations.push({
      title: 'Inspect the install path',
      description:
        'Check pricing, permissions, onboarding expectations, and any install redirects that may discourage users after the install click.',
    })
  }

  if (args.metrics.adClicks > 0 && args.metrics.completedInstalls === 0) {
    recommendations.push({
      title: 'Check paid traffic quality',
      description:
        'Ad clicks are present, but completed installs are not. Compare ad promise, targeting, and listing message.',
    })
  }

  const topCountry = args.topCountries.at(0)
  const countryTotal = args.topCountries.reduce(
    (total, point) => total + point.value,
    0,
  )

  if (
    topCountry &&
    countryTotal > 0 &&
    topCountry.value / countryTotal >= 0.35
  ) {
    recommendations.push({
      title: `Localize for ${topCountry.name}`,
      description:
        'This market is driving a meaningful share of activity. Tune screenshots, examples, and support language for that audience.',
    })
  }

  if (args.accessIssues.some((issue) => /api key|api_key/i.test(issue))) {
    recommendations.push({
      title: 'Fix app-level attribution when you have multiple listings',
      description:
        'GA is not populating the app API key dimension, so this page is using property-level events for the mapping.',
    })
  }

  if (!recommendations.length) {
    recommendations.push({
      title: 'Use this page after listing changes',
      description:
        'Watch view-to-click and click-to-install movement after changing screenshots, pricing, copy, or ads.',
    })
  }

  return recommendations.slice(0, 4)
}

function attributionLabel(row: AppStoreAnalyticsRow) {
  if (row.surfaceType !== 'Unknown') {
    return row.surfaceDetail === 'Unknown'
      ? row.surfaceType
      : `${row.surfaceType}: ${row.surfaceDetail}`
  }

  return row.sourceMedium
}

function eventKind(eventName: string): AppStoreEventKind {
  if (eventName === 'view_item') return 'listing_view'
  if (eventName === 'add_to_cart' || eventName === 'Add App button') {
    return 'install_click'
  }
  if (eventName === 'shopify_app_install') return 'completed_install'
  if (eventName === 'shopify_app_ad_click') return 'ad_click'
  if (eventName === 'Open app button') return 'open_app'

  return 'other'
}

function eventLabel(eventName: string) {
  return eventName in eventLabels
    ? eventLabels[eventName as AppStoreEventName]
    : eventName
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : null
}

function getPreviousDateRange(range: { startDate: string; endDate: string }) {
  const start = parseDateKey(range.startDate)
  const end = parseDateKey(range.endDate)
  const dayCount = Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  )
  const previousEnd = new Date(start)
  previousEnd.setDate(start.getDate() - 1)
  const previousStart = new Date(previousEnd)
  previousStart.setDate(previousEnd.getDate() - dayCount + 1)

  return {
    startDate: toDateKey(previousStart),
    endDate: toDateKey(previousEnd),
  }
}

function dateKeys(startDate: string, endDate: string) {
  const current = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  const dates: string[] = []

  while (current <= end) {
    dates.push(toDateKey(current))
    current.setDate(current.getDate() + 1)
  }

  return dates
}

function normalizeGaDate(value: string) {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  }

  return value
}

function cleanDimension(value: string) {
  const trimmed = value.trim()

  return trimmed && trimmed !== '(not set)' ? trimmed : ''
}

function sourceMediumLabel(source: string, medium: string) {
  if (source && medium) return `${source} / ${medium}`
  if (source) return source
  if (medium) return medium

  return 'Unattributed'
}

function isCustomDimensionError(error: unknown) {
  return (
    error instanceof GoogleAnalyticsApiError &&
    error.status === 400 &&
    /customEvent:|api_key|surface_type|surface_detail|not a valid dimension|Unknown dimension/i.test(
      error.message,
    )
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : 'Google Analytics request failed'
}

function signOAuthState(payload: OAuthState) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', googleStateSecret())
    .update(encoded)
    .digest('base64url')

  return `${encoded}.${signature}`
}

function verifyOAuthState(value: string): OAuthState {
  const [encoded, signature] = value.split('.')

  if (!encoded || !signature) throw new Error('Invalid Google OAuth state')

  const expectedSignature = createHmac('sha256', googleStateSecret())
    .update(encoded)
    .digest('base64url')

  if (!safeEqual(signature, expectedSignature)) {
    throw new Error('Invalid Google OAuth state signature')
  }

  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf8'),
  ) as OAuthState

  if (Date.now() - payload.createdAt > googleOAuthStateTtlMs) {
    throw new Error('Google OAuth state expired')
  }

  return payload
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

function sanitizePropertyName(value: string | null | undefined) {
  const name = value?.trim()

  return name ? name.slice(0, 100) : null
}

function sanitizeOAuthString(value: string | null | undefined) {
  const text = value?.trim()

  return text ? text : null
}

function encryptOAuthStateValue(value: string | null | undefined) {
  const text = sanitizeOAuthString(value)

  return text ? encryptSecret(text) : null
}

function googleRedirectUri() {
  return new URL(
    '/api/google-analytics/oauth/callback',
    process.env.BETTER_AUTH_URL,
  ).toString()
}

function googleClientId() {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID is required')
  }

  return process.env.GOOGLE_CLIENT_ID
}

function googleClientSecret() {
  if (!process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_SECRET is required')
  }

  return process.env.GOOGLE_CLIENT_SECRET
}

function googleStateSecret() {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET is required')
  }

  return process.env.BETTER_AUTH_SECRET
}
