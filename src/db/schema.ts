import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    activeOrganizationId: text('active_organization_id'),
  },
  (table) => [index('session_user_idx').on(table.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('account_user_idx').on(table.userId)],
)

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const passkey = pgTable(
  'passkey',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    publicKey: text('public_key').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    credentialID: text('credential_id').notNull(),
    counter: integer('counter').notNull(),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull(),
    transports: text('transports'),
    createdAt: createdAt(),
    aaguid: text('aaguid'),
  },
  (table) => [
    index('passkey_user_idx').on(table.userId),
    index('passkey_credential_idx').on(table.credentialID),
  ],
)

export const organization = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    metadata: text('metadata'),
    createdAt: createdAt(),
  },
  (table) => [index('organization_slug_idx').on(table.slug)],
)

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').default('member').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('member_organization_idx').on(table.organizationId),
    index('member_user_idx').on(table.userId),
    uniqueIndex('member_organization_user_idx').on(
      table.organizationId,
      table.userId,
    ),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    status: text('status').default('pending').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    inviterId: text('inviter_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    index('invitation_organization_idx').on(table.organizationId),
    index('invitation_email_idx').on(table.email),
  ],
)

export const partnerConnections = pgTable(
  'partner_connections',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    authOrganizationId: text('auth_organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id').notNull(),
    name: text('name'),
    encryptedToken: text('encrypted_token').notNull(),
    hasManageApps: boolean('has_manage_apps').default(false).notNull(),
    hasViewFinancials: boolean('has_view_financials').default(false).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('partner_connections_auth_org_partner_org_idx').on(
      table.authOrganizationId,
      table.organizationId,
    ),
    index('partner_connections_user_idx').on(table.userId),
  ],
)

export const partnerApps = pgTable(
  'partner_apps',
  {
    id: text('id').primaryKey(),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => partnerConnections.id, { onDelete: 'cascade' }),
    partnerAppId: text('partner_app_id').notNull(),
    apiKey: text('api_key'),
    name: text('name').notNull(),
    isTest: boolean('is_test').default(false).notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('partner_apps_connection_idx').on(table.connectionId),
    uniqueIndex('partner_apps_connection_partner_app_idx').on(
      table.connectionId,
      table.partnerAppId,
    ),
  ],
)

export const googleAnalyticsConnections = pgTable(
  'google_analytics_connections',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    authOrganizationId: text('auth_organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    propertyId: text('property_id').notNull(),
    propertyName: text('property_name'),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    scope: text('scope'),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ga_connections_auth_org_property_idx').on(
      table.authOrganizationId,
      table.propertyId,
    ),
    index('ga_connections_user_idx').on(table.userId),
  ],
)

export const googleAnalyticsAppMappings = pgTable(
  'google_analytics_app_mappings',
  {
    id: serial('id').primaryKey(),
    authOrganizationId: text('auth_organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => googleAnalyticsConnections.id, {
        onDelete: 'cascade',
      }),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    apiKey: text('api_key').notNull(),
    lastFetchedAt: timestamp('last_fetched_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('ga_app_mappings_auth_org_app_idx').on(
      table.authOrganizationId,
      table.appId,
    ),
    index('ga_app_mappings_connection_idx').on(table.connectionId),
    index('ga_app_mappings_app_idx').on(table.appId),
  ],
)

export const shops = pgTable(
  'shops',
  {
    id: serial('id').primaryKey(),
    shopifyShopId: text('shopify_shop_id'),
    myshopifyDomain: text('myshopify_domain').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('shops_myshopify_domain_idx').on(table.myshopifyDomain),
    uniqueIndex('shops_shopify_shop_id_idx').on(table.shopifyShopId),
  ],
)

export const testShops = pgTable(
  'test_shops',
  {
    id: serial('id').primaryKey(),
    authOrganizationId: text('auth_organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('test_shops_auth_org_shop_idx').on(
      table.authOrganizationId,
      table.shopId,
    ),
  ],
)

export const shopAppRelationships = pgTable(
  'shop_app_relationships',
  {
    id: serial('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }),
    uninstalledAt: timestamp('uninstalled_at', { withTimezone: true }),
    reactivatedAt: timestamp('reactivated_at', { withTimezone: true }),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('shop_app_relationships_app_shop_idx').on(
      table.appId,
      table.shopId,
    ),
    index('shop_app_relationships_status_idx').on(table.appId, table.status),
    index('shop_app_relationships_shop_app_idx').on(table.shopId, table.appId),
  ],
)

export const appEvents = pgTable(
  'app_events',
  {
    id: serial('id').primaryKey(),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => partnerConnections.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id').references(() => shops.id, {
      onDelete: 'set null',
    }),
    partnerEventId: text('partner_event_id').notNull(),
    type: text('type').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 6 }),
    currencyCode: text('currency_code'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex('app_events_connection_partner_event_idx').on(
      table.connectionId,
      table.partnerEventId,
    ),
    index('app_events_app_occurred_idx').on(table.appId, table.occurredAt),
    index('app_events_app_type_occurred_idx').on(
      table.appId,
      table.type,
      table.occurredAt,
    ),
    index('app_events_shop_occurred_idx').on(table.shopId, table.occurredAt),
  ],
)

export const financialTransactions = pgTable(
  'financial_transactions',
  {
    id: serial('id').primaryKey(),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => partnerConnections.id, { onDelete: 'cascade' }),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id').references(() => shops.id, {
      onDelete: 'set null',
    }),
    partnerTransactionId: text('partner_transaction_id').notNull(),
    transactionType: text('transaction_type').notNull(),
    chargeId: text('charge_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    grossAmount: numeric('gross_amount', { precision: 18, scale: 6 }),
    netAmount: numeric('net_amount', { precision: 18, scale: 6 }),
    currencyCode: text('currency_code'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>().notNull(),
    insertedAt: timestamp('inserted_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('financial_transactions_connection_partner_idx').on(
      table.connectionId,
      table.partnerTransactionId,
    ),
    index('financial_transactions_app_created_idx').on(
      table.appId,
      table.createdAt,
    ),
    index('financial_transactions_shop_created_idx').on(
      table.shopId,
      table.createdAt,
    ),
  ],
)

export const appSubscriptions = pgTable(
  'app_subscriptions',
  {
    id: serial('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id')
      .notNull()
      .references(() => shops.id, { onDelete: 'cascade' }),
    chargeId: text('charge_id').notNull(),
    name: text('name'),
    interval: text('interval'),
    status: text('status').notNull(),
    isTest: boolean('is_test').default(false).notNull(),
    mrrAmount: numeric('mrr_amount', { precision: 18, scale: 6 }).notNull(),
    currencyCode: text('currency_code'),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('app_subscriptions_app_shop_charge_idx').on(
      table.appId,
      table.shopId,
      table.chargeId,
    ),
    index('app_subscriptions_app_status_idx').on(table.appId, table.status),
    index('app_subscriptions_shop_status_idx').on(table.shopId, table.status),
  ],
)

export const uninstallFeedback = pgTable(
  'uninstall_feedback',
  {
    id: serial('id').primaryKey(),
    appId: text('app_id')
      .notNull()
      .references(() => partnerApps.id, { onDelete: 'cascade' }),
    shopId: integer('shop_id').references(() => shops.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    description: text('description'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('uninstall_feedback_app_occurred_idx').on(
      table.appId,
      table.occurredAt,
    ),
    index('uninstall_feedback_shop_occurred_idx').on(
      table.shopId,
      table.occurredAt,
    ),
    uniqueIndex('uninstall_feedback_partner_identity_idx')
      .on(table.appId, table.shopId, table.occurredAt, table.reason)
      .where(sql`${table.shopId} is not null`),
  ],
)

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: serial('id').primaryKey(),
    connectionId: integer('connection_id')
      .notNull()
      .references(() => partnerConnections.id, { onDelete: 'cascade' }),
    appId: text('app_id').references(() => partnerApps.id, {
      onDelete: 'set null',
    }),
    jobId: text('job_id'),
    jobType: text('job_type').notNull(),
    status: text('status').notNull(),
    cursor: text('cursor'),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    eventsCount: integer('events_count').default(0).notNull(),
    transactionsCount: integer('transactions_count').default(0).notNull(),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    index('sync_runs_connection_started_idx').on(
      table.connectionId,
      table.startedAt,
    ),
    index('sync_runs_app_started_idx').on(table.appId, table.startedAt),
  ],
)

export const syncLeases = pgTable('sync_leases', {
  key: text('key').primaryKey(),
  owner: text('owner').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
