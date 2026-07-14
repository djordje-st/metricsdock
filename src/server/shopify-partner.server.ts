import { z } from 'zod'

export const PARTNER_APP_QUERY = `#graphql
  query PartnerApp($id: ID!) {
    app(id: $id) {
      id
      name
      apiKey
    }
  }
`

const PARTNER_CONNECTION_CHECK_QUERY = `#graphql
  query PartnerConnectionCheck {
    publicApiVersions {
      handle
      supported
    }
  }
`

export const PARTNER_APP_EVENTS_QUERY = `#graphql
  query PartnerAppEvents($appId: ID!, $first: Int!, $after: String, $occurredAtMin: DateTime, $occurredAtMax: DateTime) {
    app(id: $appId) {
      id
      events(first: $first, after: $after, occurredAtMin: $occurredAtMin, occurredAtMax: $occurredAtMax) {
        edges {
          cursor
          node {
            __typename
            occurredAt
            type
            app { id }
            shop { id name myshopifyDomain }
            ... on RelationshipUninstalled { reason description }
            ... on SubscriptionChargeAccepted { charge { id name billingOn test amount { amount currencyCode } } }
            ... on SubscriptionChargeActivated { charge { id name billingOn test amount { amount currencyCode } } }
            ... on SubscriptionChargeCanceled { charge { id name billingOn test amount { amount currencyCode } } }
            ... on UsageChargeApplied { charge { id name test amount { amount currencyCode } } }
          }
        }
        pageInfo { hasNextPage }
      }
    }
  }
`

export const PARTNER_TRANSACTIONS_QUERY = `#graphql
  query PartnerTransactions($appId: ID!, $first: Int!, $after: String, $createdAtMin: DateTime, $createdAtMax: DateTime) {
    transactions(appId: $appId, first: $first, after: $after, createdAtMin: $createdAtMin, createdAtMax: $createdAtMax) {
      edges {
        cursor
        node {
          __typename
          id
          createdAt
          ... on AppOneTimeSale { chargeId grossAmount { amount currencyCode } netAmount { amount currencyCode } shop { id name myshopifyDomain } app { id } }
          ... on AppSubscriptionSale { chargeId billingInterval grossAmount { amount currencyCode } netAmount { amount currencyCode } shop { id name myshopifyDomain } app { id } }
          ... on AppUsageSale { chargeId grossAmount { amount currencyCode } netAmount { amount currencyCode } shop { id name myshopifyDomain } app { id } }
          ... on AppSaleCredit { chargeId grossAmount { amount currencyCode } netAmount { amount currencyCode } shop { id name myshopifyDomain } app { id } }
          ... on AppSaleAdjustment { chargeId grossAmount { amount currencyCode } netAmount { amount currencyCode } shop { id name myshopifyDomain } app { id } }
        }
      }
      pageInfo { hasNextPage }
    }
  }
`

const moneySchema = z
  .object({ amount: z.string(), currencyCode: z.string() })
  .passthrough()

const partnerShopSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    myshopifyDomain: z.string(),
  })
  .passthrough()

const chargeSchema = z
  .object({
    id: z.string(),
    name: z.string().nullable(),
    billingOn: z.string().nullable().optional(),
    test: z.boolean().nullable().optional(),
    amount: moneySchema.nullable().optional(),
  })
  .passthrough()

const partnerAppNodeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    apiKey: z.string().nullable(),
  })
  .passthrough()

const partnerAppEventNodeSchema = z
  .object({
    __typename: z.string(),
    occurredAt: z.string(),
    type: z.string(),
    app: z.object({ id: z.string() }).passthrough(),
    shop: partnerShopSchema.nullable(),
    reason: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    charge: chargeSchema.nullable().optional(),
  })
  .passthrough()

const partnerTransactionNodeSchema = z
  .object({
    __typename: z.string(),
    id: z.string(),
    createdAt: z.string(),
    chargeId: z.string().nullable().optional(),
    billingInterval: z.string().nullable().optional(),
    grossAmount: moneySchema.nullable().optional(),
    netAmount: moneySchema.nullable().optional(),
    shop: partnerShopSchema.nullable().optional(),
    app: z.object({ id: z.string() }).passthrough().nullable().optional(),
  })
  .passthrough()

export type PartnerShop = z.infer<typeof partnerShopSchema>
export type PartnerAppNode = z.infer<typeof partnerAppNodeSchema>
export type PartnerAppEventNode = z.infer<typeof partnerAppEventNodeSchema>
export type PartnerTransactionNode = z.infer<
  typeof partnerTransactionNodeSchema
>

type PartnerGraphQlResponse<T> = {
  data?: T
  errors?: Array<{ message: string }>
}

const partnerAppEventsConnectionSchema = connectionSchema(
  partnerAppEventNodeSchema,
)
const partnerTransactionsConnectionSchema = connectionSchema(
  partnerTransactionNodeSchema,
)

function connectionSchema<T extends z.ZodType>(nodeSchema: T) {
  return z
    .object({
      edges: z.array(
        z
          .object({
            cursor: z.string(),
            node: nodeSchema,
          })
          .passthrough(),
      ),
      pageInfo: z
        .object({
          hasNextPage: z.boolean(),
        })
        .passthrough(),
    })
    .passthrough()
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
}

function parsePartnerDto<T>(
  schema: z.ZodType<T>,
  value: unknown,
  label: string,
) {
  const parsed = schema.safeParse(value)

  if (!parsed.success) {
    throw new Error(
      `${label} response did not match expected Partner API shape: ${formatZodError(parsed.error)}`,
    )
  }

  return parsed.data
}

export function normalizeStoredPartnerAppEventPayload(value: unknown) {
  return parsePartnerDto(
    partnerAppEventNodeSchema.partial(),
    value,
    'Stored Partner app event',
  )
}

export function normalizeStoredPartnerTransactionPayload(value: unknown) {
  return parsePartnerDto(
    partnerTransactionNodeSchema.partial(),
    value,
    'Stored Partner transaction',
  )
}

function endpoint(organizationId: string) {
  return `https://partners.shopify.com/${organizationId}/api/2026-04/graphql.json`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parsePartnerGraphqlResponse<T>(text: string) {
  if (!text) return {} as PartnerGraphQlResponse<T>

  try {
    return JSON.parse(text) as PartnerGraphQlResponse<T>
  } catch {
    return null
  }
}

export async function partnerGraphql<T>(args: {
  organizationId: string
  token: string
  query: string
  variables?: Record<string, unknown>
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint(args.organizationId), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': args.token,
      },
      body: JSON.stringify({ query: args.query, variables: args.variables }),
    })

    if (response.status === 429 || response.status >= 500) {
      await sleep(500 * (attempt + 1))
      continue
    }

    const body = parsePartnerGraphqlResponse<T>(await response.text())

    if (!body) {
      throw new Error(
        `Partner API returned ${response.status} with invalid JSON`,
      )
    }

    if (!response.ok || body.errors?.length) {
      throw new Error(
        body.errors?.map((error) => error.message).join('; ') ||
          `Partner API returned ${response.status}`,
      )
    }

    if (!body.data) {
      throw new Error('Partner API returned no data')
    }

    return body.data
  }

  throw new Error('Partner API request failed after retries')
}

export async function fetchPartnerApp(args: {
  organizationId: string
  token: string
  appId: string
}) {
  const data = await partnerGraphql<{ app: unknown | null }>({
    organizationId: args.organizationId,
    token: args.token,
    query: PARTNER_APP_QUERY,
    variables: { id: args.appId },
  })

  if (!data.app) {
    throw new Error('Partner app not found')
  }

  return parsePartnerDto(partnerAppNodeSchema, data.app, 'Partner app')
}

export async function validatePartnerCredentials(args: {
  organizationId: string
  token: string
}) {
  const data = await partnerGraphql<{ publicApiVersions: unknown }>({
    organizationId: args.organizationId,
    token: args.token,
    query: PARTNER_CONNECTION_CHECK_QUERY,
  })

  if (!Array.isArray(data.publicApiVersions)) {
    throw new Error('Partner credentials could not be verified')
  }
}

export async function fetchPartnerAppEvents(args: {
  organizationId: string
  token: string
  appId: string
  after?: string | null
  occurredAtMin?: string
  occurredAtMax?: string
}) {
  const data = await partnerGraphql<{
    app: { events: unknown } | null
  }>({
    organizationId: args.organizationId,
    token: args.token,
    query: PARTNER_APP_EVENTS_QUERY,
    variables: {
      appId: args.appId,
      first: 100,
      after: args.after,
      occurredAtMin: args.occurredAtMin,
      occurredAtMax: args.occurredAtMax,
    },
  })

  if (!data.app?.events) {
    return { edges: [], pageInfo: { hasNextPage: false } }
  }

  return parsePartnerDto(
    partnerAppEventsConnectionSchema,
    data.app.events,
    'Partner app events',
  )
}

export async function fetchPartnerTransactions(args: {
  organizationId: string
  token: string
  appId: string
  after?: string | null
  createdAtMin?: string
  createdAtMax?: string
}) {
  const data = await partnerGraphql<{
    transactions: unknown
  }>({
    organizationId: args.organizationId,
    token: args.token,
    query: PARTNER_TRANSACTIONS_QUERY,
    variables: {
      appId: args.appId,
      first: 100,
      after: args.after,
      createdAtMin: args.createdAtMin,
      createdAtMax: args.createdAtMax,
    },
  })

  return parsePartnerDto(
    partnerTransactionsConnectionSchema,
    data.transactions,
    'Partner transactions',
  )
}
