type DateInput = Date | number | string | null | undefined
type NumberInput = number | string | null | undefined

type CurrencyFormatOptions = {
  currency?: string | null
  fallback?: string
  maximumFractionDigits?: number
  minimumFractionDigits?: number
}

type NumberFormatOptions = {
  fallback?: string
  maximumFractionDigits?: number
  minimumFractionDigits?: number
}

type MoneyMetricOptions = {
  currencyCode?: string | null
  fallback?: string
  hasMixedCurrencies?: boolean
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
})

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const shortDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

export function formatDate(value: DateInput, fallback = '-') {
  return formatWith(dateFormatter, value, fallback)
}

export function formatDateTime(value: DateInput, fallback = '-') {
  return formatWith(dateTimeFormatter, value, fallback)
}

export function formatShortDate(value: DateInput, fallback = '-') {
  return formatWith(shortDateFormatter, value, fallback)
}

export function formatCurrency(
  value: NumberInput,
  {
    currency = 'USD',
    fallback = '-',
    maximumFractionDigits = 2,
    minimumFractionDigits = 0,
  }: CurrencyFormatOptions = {},
) {
  const amount = parseNumber(value)
  if (amount === null) return fallback

  if (!currency) {
    return formatDecimal(amount, minimumFractionDigits, maximumFractionDigits)
  }

  try {
    return new Intl.NumberFormat(undefined, {
      currency,
      maximumFractionDigits,
      minimumFractionDigits,
      style: 'currency',
    }).format(amount)
  } catch {
    return `${formatDecimal(amount, minimumFractionDigits, maximumFractionDigits)} ${currency}`
  }
}

export function formatMoneyMetric(
  value: NumberInput,
  {
    currencyCode = null,
    fallback = '-',
    hasMixedCurrencies = false,
  }: MoneyMetricOptions = {},
) {
  if (hasMixedCurrencies) return 'Mixed currencies'

  return formatCurrency(value, { currency: currencyCode, fallback })
}

export function formatNumber(
  value: NumberInput,
  {
    fallback = '-',
    maximumFractionDigits = 0,
    minimumFractionDigits = 0,
  }: NumberFormatOptions = {},
) {
  const amount = parseNumber(value)
  if (amount === null) return fallback

  return formatDecimal(amount, minimumFractionDigits, maximumFractionDigits)
}

export function formatCompactNumber(
  value: NumberInput,
  {
    fallback = '-',
    maximumFractionDigits = 1,
    minimumFractionDigits = 0,
  }: NumberFormatOptions = {},
) {
  const amount = parseNumber(value)
  if (amount === null) return fallback

  return new Intl.NumberFormat(undefined, {
    compactDisplay: 'short',
    maximumFractionDigits,
    minimumFractionDigits,
    notation: 'compact',
  }).format(amount)
}

export function formatPercent(
  value: NumberInput,
  {
    fallback = '-',
    maximumFractionDigits = 1,
    minimumFractionDigits = 0,
  }: NumberFormatOptions = {},
) {
  const amount = parseNumber(value)
  if (amount === null) return fallback

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits,
    style: 'percent',
  }).format(amount)
}

function formatWith(
  formatter: Intl.DateTimeFormat,
  value: DateInput,
  fallback: string,
) {
  if (!value) return fallback

  const date = parseDate(value)
  if (Number.isNaN(date.getTime())) return fallback

  return formatter.format(date)
}

function parseDate(value: Exclude<DateInput, null | undefined>) {
  if (value instanceof Date || typeof value === 'number') return new Date(value)

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!dateOnly) return new Date(value)

  const [, year, month, day] = dateOnly
  return new Date(Number(year), Number(month) - 1, Number(day))
}

function parseNumber(value: NumberInput) {
  if (value === null || value === undefined || value === '') return null

  const amount = Number(value)
  if (!Number.isFinite(amount)) return null

  return amount
}

function formatDecimal(
  value: number,
  minimumFractionDigits: number,
  maximumFractionDigits: number,
) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value)
}
