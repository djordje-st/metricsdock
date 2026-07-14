import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'
import { z } from 'zod'
import {
  deleteUserPartnerApp,
  deleteUserPartnerConnection,
  deleteUserGoogleAnalyticsAppMapping,
  deleteUserGoogleAnalyticsConnection,
  enqueueUserSyncJob,
  getCurrentOrganizationContext,
  getUserAppDetailAnalytics,
  getUserAppStoreAnalyticsReport,
  getUserChurnReport,
  getUserCustomerReport,
  getUserDashboardAnalytics,
  getUserRevenueReport,
  getUserSettings,
  getUserShopDetail,
  saveUserPartnerApp,
  saveUserPartnerConnection,
  saveUserGoogleAnalyticsAppMapping,
  searchUserShops,
  setUserPartnerAppTestMode,
  setUserShopTestMode,
} from '#/server/app.server.ts'

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const appId = z.string().trim().min(1)
const appIds = z.array(appId).max(100).optional()

const appScopeInput = z
  .object({
    appId: appId.optional(),
    appIds,
    startDate: dateKey.optional(),
    endDate: dateKey.optional(),
  })
  .default({})

const churnReportInput = appScopeInput.pipe(
  z.object({
    appId: appId.optional(),
    appIds,
    startDate: dateKey.optional(),
    endDate: dateKey.optional(),
    reason: z.string().trim().min(1).optional(),
  }),
)

const shopDetailInput = z.object({
  shopId: z.number().int().positive(),
  startDate: dateKey.optional(),
  endDate: dateKey.optional(),
})

const shopSearchInput = z.object({
  query: z.string().max(100),
})

const appTestModeInput = z.object({
  appId,
  isTest: z.boolean(),
})

const shopTestModeInput = z.object({
  shopId: z.number().int().positive(),
  isTest: z.boolean(),
})

const deletePartnerAppInput = z.object({
  appId,
})

const deletePartnerConnectionInput = z.object({
  connectionId: z.number().int().positive(),
})

const googleAnalyticsMappingInput = z.object({
  connectionId: z.number().int().positive(),
  appId,
  apiKey: z.string().trim().min(1),
})

const deleteGoogleAnalyticsMappingInput = z.object({
  mappingId: z.number().int().positive(),
})

const deleteGoogleAnalyticsConnectionInput = z.object({
  connectionId: z.number().int().positive(),
})

export const getDashboardAnalytics = createServerFn({ method: 'GET' })
  .validator(appScopeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return getUserDashboardAnalytics({
      authOrganizationId: context.organizationId,
      appIds: data.appIds,
      startDate: data.startDate,
      endDate: data.endDate,
    })
  })

export const getRevenueReport = createServerFn({ method: 'GET' })
  .validator(appScopeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return getUserRevenueReport({
      authOrganizationId: context.organizationId,
      appIds: data.appIds,
      startDate: data.startDate,
      endDate: data.endDate,
    })
  })

export const getCustomerReport = createServerFn({ method: 'GET' })
  .validator(appScopeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return getUserCustomerReport({
      authOrganizationId: context.organizationId,
      appIds: data.appIds,
      startDate: data.startDate,
      endDate: data.endDate,
    })
  })

export const getChurnReport = createServerFn({ method: 'GET' })
  .validator(churnReportInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return getUserChurnReport({
      authOrganizationId: context.organizationId,
      appIds: data.appIds,
      startDate: data.startDate,
      endDate: data.endDate,
      reason: data.reason,
    })
  })

export const getAppStoreAnalyticsReport = createServerFn({ method: 'GET' })
  .validator(appScopeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return getUserAppStoreAnalyticsReport({
      authOrganizationId: context.organizationId,
      appIds: data.appIds,
      startDate: data.startDate,
      endDate: data.endDate,
    })
  })

export const getAppDetailAnalytics = createServerFn({ method: 'GET' })
  .validator(appScopeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    if (!data.appId) throw notFound()

    return getUserAppDetailAnalytics({
      authOrganizationId: context.organizationId,
      appId: data.appId,
      startDate: data.startDate,
      endDate: data.endDate,
    })
  })

export const getSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    const context = await getCurrentOrganizationContext()

    return getUserSettings({
      authOrganizationId: context.organizationId,
    })
  },
)

export const getShopDetail = createServerFn({ method: 'GET' })
  .validator(shopDetailInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const detail = await getUserShopDetail({
      authOrganizationId: context.organizationId,
      ...data,
    })

    if (!detail) throw notFound()

    return detail
  })

export const searchShops = createServerFn({ method: 'GET' })
  .validator(shopSearchInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return searchUserShops({
      authOrganizationId: context.organizationId,
      query: data.query,
    })
  })

export const setPartnerAppTestMode = createServerFn({ method: 'POST' })
  .validator(appTestModeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await setUserPartnerAppTestMode({
      authOrganizationId: context.organizationId,
      ...data,
    })

    if (!result) throw notFound()

    return result
  })

export const setShopTestMode = createServerFn({ method: 'POST' })
  .validator(shopTestModeInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await setUserShopTestMode({
      authOrganizationId: context.organizationId,
      ...data,
    })

    if (!result) throw notFound()

    return result
  })

export const savePartnerConnection = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      organizationId: z.string().min(1),
      token: z.string().min(1),
      name: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return saveUserPartnerConnection({
      userId: context.user.id,
      authOrganizationId: context.organizationId,
      ...data,
    })
  })

export const savePartnerApp = createServerFn({ method: 'POST' })
  .validator(
    z.discriminatedUnion('mode', [
      z.object({
        mode: z.literal('existing'),
        connectionId: z.number().int().positive(),
        partnerAppId: z.string().trim().min(1),
      }),
      z.object({
        mode: z.literal('new'),
        name: z.string().min(1),
        organizationId: z.string().min(1),
        token: z.string().min(1),
        partnerAppId: z.string().trim().min(1),
      }),
    ]),
  )
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()

    return saveUserPartnerApp({
      userId: context.user.id,
      authOrganizationId: context.organizationId,
      ...data,
    })
  })

export const deletePartnerApp = createServerFn({ method: 'POST' })
  .validator(deletePartnerAppInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await deleteUserPartnerApp({
      authOrganizationId: context.organizationId,
      appId: data.appId,
    })

    if (!result) throw notFound()

    return result
  })

export const deletePartnerConnection = createServerFn({ method: 'POST' })
  .validator(deletePartnerConnectionInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await deleteUserPartnerConnection({
      authOrganizationId: context.organizationId,
      connectionId: data.connectionId,
    })

    if (!result) throw notFound()

    return result
  })

export const saveGoogleAnalyticsMapping = createServerFn({ method: 'POST' })
  .validator(googleAnalyticsMappingInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await saveUserGoogleAnalyticsAppMapping({
      authOrganizationId: context.organizationId,
      ...data,
    })

    if (!result) throw notFound()

    return result
  })

export const deleteGoogleAnalyticsMapping = createServerFn({ method: 'POST' })
  .validator(deleteGoogleAnalyticsMappingInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await deleteUserGoogleAnalyticsAppMapping({
      authOrganizationId: context.organizationId,
      mappingId: data.mappingId,
    })

    if (!result) throw notFound()

    return result
  })

export const deleteGoogleAnalyticsProperty = createServerFn({ method: 'POST' })
  .validator(deleteGoogleAnalyticsConnectionInput)
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const result = await deleteUserGoogleAnalyticsConnection({
      authOrganizationId: context.organizationId,
      connectionId: data.connectionId,
    })

    if (!result) throw notFound()

    return result
  })

export const enqueueUserSync = createServerFn({ method: 'POST' })
  .validator(z.object({ appId: appId.optional() }).default({}))
  .handler(async ({ data }) => {
    const context = await getCurrentOrganizationContext()
    const job = await enqueueUserSyncJob({
      userId: context.user.id,
      authOrganizationId: context.organizationId,
      appId: data.appId,
    })

    return { jobId: job.id }
  })
