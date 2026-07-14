import { createCollection, useLiveQuery } from '@tanstack/react-db'
import { QueryClient } from '@tanstack/react-query'
import { queryCollectionOptions } from '@tanstack/query-db-collection'
import { getSettings } from '#/server/app.functions.ts'

const queryClient = new QueryClient()

type SettingsRow = Awaited<ReturnType<typeof getSettings>> & {
  id: 'settings'
}

export const settingsCollection = createCollection(
  queryCollectionOptions({
    id: 'settings',
    queryKey: ['settings'],
    queryClient,
    staleTime: 30_000,
    queryFn: async (): Promise<Array<SettingsRow>> => [
      { id: 'settings', ...(await getSettings()) },
    ],
    getKey: (row) => row.id,
  }),
)

export function useSettingsData() {
  const result = useLiveQuery(settingsCollection)

  return { ...result, data: result.data.at(0) }
}

export async function preloadSettings() {
  await settingsCollection.preload()
}

export async function refetchAppData() {
  await refetchSettings()
}

export async function refetchSettings() {
  await settingsCollection.utils.refetch()
}

export async function clearAppData() {
  await settingsCollection.cleanup()
}
