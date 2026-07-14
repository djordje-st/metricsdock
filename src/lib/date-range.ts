export type DateRangeValue = {
  startDate: string
  endDate: string
}

export type ReportSearch = Partial<DateRangeValue> & {
  appIds?: string[]
  reason?: string
  sort?: string
  [key: string]: unknown
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

export function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)

  return new Date(year, month - 1, day)
}

export function getTrailingDateRange(
  days: number,
  today = new Date(),
): DateRangeValue {
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const start = new Date(end)
  start.setDate(end.getDate() - Math.max(days - 1, 0))

  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  }
}

export function getDefaultDateRange(today = new Date()): DateRangeValue {
  return getTrailingDateRange(30, today)
}

export function normalizeDateRangeSearch(
  search?: Partial<Record<'startDate' | 'endDate', unknown>>,
): DateRangeValue {
  const fallback = getDefaultDateRange()
  const todayKey = toDateKey(new Date())
  const startDate =
    readPastOrPresentDateKey(search?.startDate, todayKey) ?? fallback.startDate
  const endDate =
    readPastOrPresentDateKey(search?.endDate, todayKey) ?? fallback.endDate

  if (startDate > endDate) return fallback

  return { startDate, endDate }
}

export function normalizeReportLoaderSearch(search: ReportSearch) {
  const appIds = readStringArray(search.appIds)

  return {
    ...normalizeDateRangeSearch(search),
    ...(appIds.length ? { appIds } : {}),
  }
}

export function normalizeReportSearch(search: Record<string, unknown>) {
  const todayKey = toDateKey(new Date())
  const startDate =
    readPastOrPresentDateKey(search.startDate, todayKey) ?? undefined
  const endDate =
    readPastOrPresentDateKey(search.endDate, todayKey) ?? undefined
  const appIds = readStringArray(search.appIds)
  const reason =
    typeof search.reason === 'string' && search.reason.trim()
      ? search.reason.trim().slice(0, 100)
      : undefined
  const sort = typeof search.sort === 'string' ? search.sort : undefined
  const tableSearch = normalizeTableSearch(search)

  return {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(appIds.length ? { appIds } : {}),
    ...(reason ? { reason } : {}),
    ...(sort ? { sort } : {}),
    ...tableSearch,
  }
}

export function getDateRangeBounds(range: DateRangeValue) {
  const start = parseDateKey(range.startDate)
  const endExclusive = parseDateKey(range.endDate)
  endExclusive.setDate(endExclusive.getDate() + 1)

  return { start, endExclusive }
}

function readDateKey(value: unknown) {
  return typeof value === 'string' && DATE_KEY_RE.test(value) ? value : null
}

function readPastOrPresentDateKey(value: unknown, todayKey: string) {
  const dateKey = readDateKey(value)

  return dateKey && dateKey <= todayKey ? dateKey : null
}

function readStringArray(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? [value]
      : []

  return [
    ...new Set(
      values
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean),
    ),
  ]
}

function normalizeTableSearch(search: Record<string, unknown>) {
  const tableSearch: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(search)) {
    if (key.endsWith('Sort') && typeof value === 'string' && value.trim()) {
      tableSearch[key] = value
      continue
    }

    if (key === 'filters' || key.endsWith('Filters')) {
      const filters = readTableFilters(value)

      if (filters) tableSearch[key] = filters
    }
  }

  return tableSearch
}

function readTableFilters(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const filters: Record<string, string[]> = {}

  for (const [key, values] of Object.entries(value)) {
    if (!Array.isArray(values)) continue

    const normalizedValues = readStringArray(values)

    if (normalizedValues.length) filters[key] = normalizedValues
  }

  return Object.keys(filters).length ? filters : null
}
