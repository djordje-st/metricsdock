export type DateSeriesPoint = {
  date: string
  value: number
}

export type RankedChartPoint = {
  name: string
  value: number
}

type DateRangeFilter = {
  startDate: string
  endDate: string
}

type CountByDateOptions = {
  dateRange?: DateRangeFilter
}

export function countByDate<T>(
  items: T[],
  getDate: (item: T) => string | null | undefined,
  options: CountByDateOptions = {},
) {
  const counts = new Map<string, number>()

  for (const item of items) {
    const date = toDateKey(getDate(item))
    if (!date) continue
    if (!isDateInRange(date, options.dateRange)) continue

    counts.set(date, (counts.get(date) ?? 0) + 1)
  }

  return toDateSeries(counts)
}

export function countByDateForFields<T>(
  items: T[],
  fields: Array<{
    key: string
    getDate: (item: T) => string | null | undefined
  }>,
  options: CountByDateOptions = {},
): Array<{ date: string } & Record<string, string | number>> {
  const byDate = new Map<string, Record<string, number | string>>()

  for (const item of items) {
    for (const field of fields) {
      const date = toDateKey(field.getDate(item))
      if (!date) continue
      if (!isDateInRange(date, options.dateRange)) continue

      const row = byDate.get(date) ?? { date }
      row[field.key] = Number(row[field.key] ?? 0) + 1
      byDate.set(date, row)
    }
  }

  return [...byDate.values()]
    .map((row) => ({ ...row, date: String(row.date) }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function rankedByValue<T>(
  items: T[],
  getName: (item: T) => string,
  getValue: (item: T) => number,
  limit = 5,
): RankedChartPoint[] {
  return items
    .map((item) => ({ name: getName(item), value: getValue(item) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit)
}

export function sumByGroup<T>(
  items: T[],
  getName: (item: T) => string | null | undefined,
  getValue: (item: T) => number,
  limit = 5,
): RankedChartPoint[] {
  const sums = new Map<string, number>()

  for (const item of items) {
    const name = getName(item)?.trim()
    if (!name) continue

    sums.set(name, (sums.get(name) ?? 0) + getValue(item))
  }

  return [...sums.entries()]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit)
}

function toDateSeries(counts: Map<string, number>): DateSeriesPoint[] {
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }))
}

function toDateKey(value: string | null | undefined) {
  if (!value) return null

  return value.slice(0, 10)
}

function isDateInRange(date: string, range: DateRangeFilter | undefined) {
  if (!range) return true

  return date >= range.startDate && date <= range.endDate
}
