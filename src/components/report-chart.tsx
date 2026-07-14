import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '#/components/ui/chart.tsx'
import type { ChartConfig } from '#/components/ui/chart.tsx'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty.tsx'
import { formatCompactNumber, formatShortDate } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'

export type SeriesPoint = { date: string; value: number }
export type RankedPoint = { name: string; value: number }
export type MultiSeriesPoint = { date: string } & Record<
  string,
  string | number
>
export type MultiSeriesConfig = {
  key: string
  label: string
  color?: string
  tone?: ChartTone
}

export type ChartTone = 'default' | 'negative'

const negativeChartColor = 'var(--chart-5)'
const config = {
  value: { label: 'Value', color: 'var(--chart-1)' },
  negative: { color: negativeChartColor },
} satisfies ChartConfig
const negativeConfig = {
  value: { label: 'Value', color: negativeChartColor },
  negative: { color: negativeChartColor },
} satisfies ChartConfig
const configByTone: Record<ChartTone, ChartConfig> = {
  default: config,
  negative: negativeConfig,
}

const dateChartMargin = { left: 8, right: 8 } as const
const dateChartYAxisWidth = 44
const rankedChartMargin = { left: 8, right: 16 } as const
const rankedYAxisTick = { fontSize: 12 } as const
const chartDateLabels = new Map<string, string>()
const chartVisibilityRootMargin = '480px'

const formatChartDate = (value: string | number) => {
  const key = String(value)
  const cached = chartDateLabels.get(key)
  if (cached) return cached

  const formatted = formatShortDate(value, key)
  chartDateLabels.set(key, formatted)

  return formatted
}

const formatChartTooltipLabel = (value: unknown): ReactNode => {
  if (typeof value === 'string') {
    return formatChartDate(value)
  }

  if (typeof value === 'number') return value

  return null
}

const formatChartValue = (value: string | number) =>
  formatCompactNumber(value, { maximumFractionDigits: 1 })
const getBarFill = (value: unknown, fallback: string) => {
  const numericValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN

  return Number.isFinite(numericValue) && numericValue < 0
    ? 'var(--color-negative)'
    : fallback
}

const defaultTooltipContent = <ChartTooltipContent />
const dateTooltipContent = (
  <ChartTooltipContent labelFormatter={formatChartTooltipLabel} />
)
const legendContent = <ChartLegendContent />

function LazyChartContainer({
  className,
  children,
  ...props
}: ComponentProps<typeof ChartContainer>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldRender, setShouldRender] = useState(false)

  useEffect(() => {
    if (shouldRender) return

    const element = containerRef.current
    if (!element) return

    if (!('IntersectionObserver' in window)) {
      setShouldRender(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldRender(true)
          observer.disconnect()
        }
      },
      { rootMargin: chartVisibilityRootMargin },
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [shouldRender])

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      {shouldRender ? (
        <ChartContainer {...props} className="h-full w-full">
          {children}
        </ChartContainer>
      ) : null}
    </div>
  )
}

function ReportChartComponent({
  data,
  type = 'line',
  tone = 'default',
  className,
}: {
  data: SeriesPoint[]
  type?: 'line' | 'bar' | 'area'
  tone?: ChartTone
  className?: string
}) {
  if (!data.length) {
    return <ChartEmptyState className={cn('h-72', className)} />
  }

  return (
    <LazyChartContainer
      config={configByTone[tone]}
      className={cn('h-72 w-full', className)}
    >
      {type === 'bar' ? (
        <BarChart data={data} accessibilityLayer margin={dateChartMargin}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatChartDate}
          />
          <YAxis
            axisLine={false}
            tickFormatter={formatChartValue}
            tickLine={false}
            tickMargin={8}
            width={dateChartYAxisWidth}
          />
          <ChartTooltip content={dateTooltipContent} />
          <Bar
            dataKey="value"
            fill="var(--color-value)"
            maxBarSize={40}
            radius={8}
          >
            {data.map((point) => (
              <Cell
                key={point.date}
                fill={getBarFill(point.value, 'var(--color-value)')}
              />
            ))}
          </Bar>
        </BarChart>
      ) : type === 'area' ? (
        <AreaChart data={data} accessibilityLayer margin={dateChartMargin}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatChartDate}
          />
          <YAxis
            axisLine={false}
            tickFormatter={formatChartValue}
            tickLine={false}
            tickMargin={8}
            width={dateChartYAxisWidth}
          />
          <ChartTooltip content={dateTooltipContent} />
          <Area
            dataKey="value"
            fill="var(--color-value)"
            fillOpacity={0.16}
            stroke="var(--color-value)"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      ) : (
        <LineChart data={data} accessibilityLayer margin={dateChartMargin}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatChartDate}
          />
          <YAxis
            axisLine={false}
            tickFormatter={formatChartValue}
            tickLine={false}
            tickMargin={8}
            width={dateChartYAxisWidth}
          />
          <ChartTooltip content={dateTooltipContent} />
          <Line
            dataKey="value"
            dot={false}
            stroke="var(--color-value)"
            strokeWidth={2}
            type="monotone"
          />
        </LineChart>
      )}
    </LazyChartContainer>
  )
}

function RankedBarChartComponent({
  data,
  className,
}: {
  data: RankedPoint[]
  className?: string
}) {
  if (!data.length) {
    return <ChartEmptyState className={cn('h-64', className)} />
  }

  return (
    <LazyChartContainer
      config={config}
      className={cn('h-64 w-full', className)}
      initialDimension={{ width: 320, height: 220 }}
    >
      <BarChart
        data={data}
        accessibilityLayer
        layout="vertical"
        margin={rankedChartMargin}
      >
        <XAxis
          type="number"
          axisLine={false}
          tickFormatter={formatChartValue}
          tickLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          tickLine={false}
          axisLine={false}
          width={112}
          tick={rankedYAxisTick}
        />
        <ChartTooltip content={defaultTooltipContent} />
        <Bar
          dataKey="value"
          fill="var(--color-value)"
          maxBarSize={28}
          radius={4}
        />
      </BarChart>
    </LazyChartContainer>
  )
}

function MultiBarChartComponent({
  data,
  series,
  className,
}: {
  data: MultiSeriesPoint[]
  series: MultiSeriesConfig[]
  className?: string
}) {
  const chartConfig = useMemo(
    () =>
      ({
        ...Object.fromEntries(
          series.map((item, index) => [
            item.key,
            {
              label: item.label,
              color:
                item.tone === 'negative'
                  ? negativeChartColor
                  : (item.color ?? `var(--chart-${Math.min(index + 1, 5)})`),
            },
          ]),
        ),
        negative: { color: negativeChartColor },
      }) satisfies ChartConfig,
    [series],
  )

  if (!data.length) {
    return <ChartEmptyState className={cn('h-72', className)} />
  }

  return (
    <LazyChartContainer
      config={chartConfig}
      className={cn('h-72 w-full', className)}
    >
      <BarChart data={data} accessibilityLayer margin={dateChartMargin}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatChartDate}
        />
        <YAxis
          axisLine={false}
          tickFormatter={formatChartValue}
          tickLine={false}
          tickMargin={8}
          width={dateChartYAxisWidth}
        />
        <ChartTooltip content={dateTooltipContent} />
        <ChartLegend content={legendContent} />
        {series.map((item) => (
          <Bar
            key={item.key}
            dataKey={item.key}
            fill={`var(--color-${item.key})`}
            maxBarSize={32}
            radius={4}
          >
            {data.map((point) => {
              const fallback = `var(--color-${item.key})`

              return (
                <Cell
                  key={`${item.key}-${point.date}`}
                  fill={getBarFill(point[item.key], fallback)}
                />
              )
            })}
          </Bar>
        ))}
      </BarChart>
    </LazyChartContainer>
  )
}

function ChartEmptyState({ className }: { className?: string }) {
  return (
    <Empty
      className={cn('rounded bg-muted/30 ring-1 ring-border/70', className)}
    >
      <EmptyHeader>
        <EmptyTitle>No data yet</EmptyTitle>
        <EmptyDescription>
          Run a sync or widen the date range once more Shopify data is
          available.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function areSeriesEqual(
  previous: MultiSeriesConfig[],
  next: MultiSeriesConfig[],
) {
  if (previous === next) return true
  if (previous.length !== next.length) return false

  return previous.every((item, index) => {
    const nextItem = next[index]
    return (
      item.key === nextItem.key &&
      item.label === nextItem.label &&
      item.color === nextItem.color &&
      item.tone === nextItem.tone
    )
  })
}

const ReportChart = memo(ReportChartComponent)
const RankedBarChart = memo(RankedBarChartComponent)
const MultiBarChart = memo(MultiBarChartComponent, (previous, next) => {
  return (
    previous.data === next.data &&
    previous.className === next.className &&
    areSeriesEqual(previous.series, next.series)
  )
})

ReportChart.displayName = 'ReportChart'
RankedBarChart.displayName = 'RankedBarChart'
MultiBarChart.displayName = 'MultiBarChart'

export { ReportChart, RankedBarChart, MultiBarChart }
