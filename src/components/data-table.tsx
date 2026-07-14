import { createContext, useContext, useMemo, useState } from 'react'
import {
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type {
  Column,
  ColumnDef,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronsUpDownIcon,
  XIcon,
} from 'lucide-react'
import pluralize from 'pluralize'
import { Button } from '#/components/ui/button.tsx'
import { Input } from '#/components/ui/input.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select.tsx'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table.tsx'
import { cn } from '#/lib/utils.ts'

const DataTableSortContext = createContext<SortingState>([])
const DATA_TABLE_DEFAULT_PAGE_SIZE = 20
const DATA_TABLE_PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const
const EMPTY_FILTER_VALUE = '__metricsdock-empty__'
const FILTER_OPTION_PAGE_SIZE = 75
const filterLabelCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export type DataTableFilter<TData> = {
  id: string
  title: string
  getValue?: (row: TData) => unknown
  formatValue?: (value: string) => string
  emptyLabel?: string
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  emptyMessage?: string
  filterParam?: string
  filterableColumns?: DataTableFilter<TData>[]
  sortParam?: string
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyMessage = 'No results.',
  filterParam,
  filterableColumns = [],
  sortParam = 'sort',
}: DataTableProps<TData, TValue>) {
  const tableFilterParam = filterParam ?? getFilterParam(sortParam)
  const [sorting, setSorting] = useState<SortingState>(() =>
    readSortingFromUrl(sortParam),
  )
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>(
    () => readFiltersFromUrl(tableFilterParam, filterableColumns),
  )
  const activeFilterCount = Object.values(columnFilters).reduce(
    (count, values) => count + values.length,
    0,
  )
  const columnFilterSets = useMemo(
    () =>
      new Map(
        Object.entries(columnFilters).map(([id, values]) => [
          id,
          new Set(values),
        ]),
      ),
    [columnFilters],
  )
  const filterOptions = useMemo(
    () => getFilterOptions(data, filterableColumns),
    [data, filterableColumns],
  )
  const filteredData = useMemo(() => {
    if (!activeFilterCount) return data

    return data.filter((row) =>
      filterableColumns.every((filter) => {
        const selectedValues = columnFilterSets.get(filter.id)

        return (
          !selectedValues?.size ||
          selectedValues.has(getNormalizedFilterValue(row, filter))
        )
      }),
    )
  }, [activeFilterCount, columnFilterSets, data, filterableColumns])
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting((current) => {
      const next = functionalUpdate(updater, current)
      replaceSortingInUrl(sortParam, next)
      return next
    })
  }
  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      pagination: {
        pageSize: DATA_TABLE_DEFAULT_PAGE_SIZE,
      },
    },
  })
  const { pageIndex, pageSize } = table.getState().pagination
  const rowCount = table.getPrePaginationRowModel().rows.length
  const totalCount = data.length
  const hasFilteredRows = activeFilterCount > 0 && rowCount !== totalCount
  const pageSizeOptions = DATA_TABLE_PAGE_SIZE_OPTIONS.map((option) => ({
    disabled: option > rowCount && option !== pageSize,
    label: String(option),
    value: String(option),
  }))
  const firstRow = rowCount ? pageIndex * pageSize + 1 : 0
  const lastRow = rowCount
    ? Math.min(firstRow + table.getRowModel().rows.length - 1, rowCount)
    : 0
  const hasPagination = table.getPageCount() > 1

  function toggleFilterValue(id: string, value: string, checked: boolean) {
    setColumnFilters((current) => {
      const currentValues = current[id] ?? []
      const next = { ...current }
      const nextValues = checked
        ? Array.from(new Set([...currentValues, value]))
        : currentValues.filter((currentValue) => currentValue !== value)

      if (nextValues.length) {
        next[id] = nextValues
      } else {
        delete next[id]
      }

      replaceFiltersInUrl(tableFilterParam, next)

      return next
    })
    table.setPageIndex(0)
  }

  function clearFilters() {
    setColumnFilters({})
    replaceFiltersInUrl(tableFilterParam, {})
    table.setPageIndex(0)
  }

  function clearFilter(id: string) {
    setColumnFilters((current) => {
      const next = { ...current }
      delete next[id]
      replaceFiltersInUrl(tableFilterParam, next)
      return next
    })
    table.setPageIndex(0)
  }

  return (
    <DataTableSortContext.Provider value={sorting}>
      <div className="flex flex-col gap-3">
        {filterableColumns.length ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {filterableColumns.map((filter) => {
              const options = filterOptions.get(filter.id) ?? []

              return (
                <DataTableFilterPopover
                  key={filter.id}
                  filter={filter}
                  options={options}
                  selectedValues={columnFilters[filter.id] ?? []}
                  onToggle={(value, checked) =>
                    toggleFilterValue(filter.id, value, checked)
                  }
                  onClear={() => clearFilter(filter.id)}
                />
              )
            })}
            {activeFilterCount ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="self-start"
              >
                <XIcon data-icon="inline-start" />
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="overflow-x-auto rounded bg-background ring-1 ring-border/70">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {activeFilterCount
                      ? 'No items match the selected filters.'
                      : emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {firstRow}-{lastRow} of {rowCount}{' '}
            {hasFilteredRows ? 'filtered items' : 'items'}
            {hasFilteredRows ? ` (${totalCount} total)` : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Rows</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => table.setPageSize(Number(value))}
                items={pageSizeOptions}
              >
                <SelectTrigger size="sm" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {pageSizeOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            {hasPagination ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  Next
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </DataTableSortContext.Provider>
  )
}

function DataTableFilterPopover<TData>({
  filter,
  options,
  selectedValues,
  onToggle,
  onClear,
}: {
  filter: DataTableFilter<TData>
  options: { label: string; value: string }[]
  selectedValues: string[]
  onToggle: (value: string, checked: boolean) => void
  onClear: () => void
}) {
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(FILTER_OPTION_PAGE_SIZE)
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const selectedLabels = useMemo(
    () =>
      selectedValues
        .map(
          (value) =>
            options.find((option) => option.value === value)?.label ??
            getFilterLabel(value, filter),
        )
        .filter((label): label is string => Boolean(label)),
    [filter, options, selectedValues],
  )
  const matchingOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filteredOptions = normalizedQuery
      ? options.filter((option) =>
          option.label.toLowerCase().includes(normalizedQuery),
        )
      : options

    const selectedOptions = filteredOptions.filter((option) =>
      selectedSet.has(option.value),
    )
    const unselectedOptions = filteredOptions.filter(
      (option) => !selectedSet.has(option.value),
    )

    return [...selectedOptions, ...unselectedOptions]
  }, [options, query, selectedSet])
  const renderedCount = Math.min(
    Math.max(visibleCount, selectedValues.length),
    matchingOptions.length,
  )
  const visibleOptions = matchingOptions.slice(0, renderedCount)
  const pluralTitle = getPluralFilterTitle(filter.title)
  const label =
    selectedLabels.length === 0
      ? `All ${pluralTitle}`
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} ${pluralTitle}`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant={selectedValues.length ? 'secondary' : 'outline'}
            size="sm"
            className="w-full justify-start sm:w-44"
            disabled={!options.length}
          />
        }
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-2">
        <div className="flex items-center gap-2">
          <Input
            value={query}
            placeholder={`Search ${pluralTitle}`}
            className="h-8"
            onChange={(event) => {
              setQuery(event.target.value)
              setVisibleCount(FILTER_OPTION_PAGE_SIZE)
            }}
          />
          {selectedValues.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear}>
              Clear
            </Button>
          ) : null}
        </div>
        <div className="max-h-72 overflow-y-auto pr-1">
          {visibleOptions.length ? (
            <div className="flex flex-col gap-1">
              {visibleOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <input
                    type="checkbox"
                    checked={selectedSet.has(option.value)}
                    className="size-4 accent-primary"
                    onChange={(event) =>
                      onToggle(option.value, event.currentTarget.checked)
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="px-1.5 py-6 text-center text-sm text-muted-foreground">
              No options found.
            </p>
          )}
        </div>
        {renderedCount < matchingOptions.length ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setVisibleCount((count) => count + FILTER_OPTION_PAGE_SIZE)
            }
          >
            Show more ({renderedCount} of {matchingOptions.length})
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function getPluralFilterTitle(title: string) {
  return pluralize(title.toLowerCase())
}

function getFilterOptions<TData>(
  data: TData[],
  filters: DataTableFilter<TData>[],
) {
  const options = new Map<string, { label: string; value: string }[]>()

  for (const filter of filters) {
    const values = new Map<string, string>()

    for (const row of data) {
      const value = getNormalizedFilterValue(row, filter)

      if (!values.has(value)) {
        values.set(value, getFilterLabel(value, filter))
      }
    }

    options.set(
      filter.id,
      Array.from(values, ([value, label]) => ({ label, value })).sort((a, b) =>
        filterLabelCollator.compare(a.label, b.label),
      ),
    )
  }

  return options
}

function getFilterParam(sortParam: string) {
  if (sortParam === 'sort') return 'filters'
  if (sortParam.endsWith('Sort')) return `${sortParam.slice(0, -4)}Filters`

  return `${sortParam}Filters`
}

function readFiltersFromUrl<TData>(
  filterParam: string,
  filterableColumns: DataTableFilter<TData>[],
) {
  if (typeof window === 'undefined') return {}

  const value = new URLSearchParams(window.location.search).get(filterParam)
  if (!value) return {}

  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    const filterIds = new Set(filterableColumns.map((filter) => filter.id))
    const filters: Record<string, string[]> = {}

    for (const [id, values] of Object.entries(parsed)) {
      if (!filterIds.has(id) || !Array.isArray(values)) continue

      const normalizedValues = [
        ...new Set(
          values
            .map((item) => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean),
        ),
      ]

      if (normalizedValues.length) filters[id] = normalizedValues
    }

    return filters
  } catch {
    return {}
  }
}

function replaceFiltersInUrl(
  filterParam: string,
  filters: Record<string, string[]>,
) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const normalizedFilters = Object.fromEntries(
    Object.entries(filters).filter(([, values]) => values.length),
  )

  if (Object.keys(normalizedFilters).length) {
    url.searchParams.set(filterParam, JSON.stringify(normalizedFilters))
  } else {
    url.searchParams.delete(filterParam)
  }

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
}

function getNormalizedFilterValue<TData>(
  row: TData,
  filter: DataTableFilter<TData>,
) {
  const rawValue = filter.getValue
    ? filter.getValue(row)
    : (row as Record<string, unknown>)[filter.id]

  if (rawValue === null || rawValue === undefined) return EMPTY_FILTER_VALUE

  const value = String(rawValue).trim()

  return value ? value : EMPTY_FILTER_VALUE
}

function getFilterLabel<TData>(value: string, filter: DataTableFilter<TData>) {
  if (value === EMPTY_FILTER_VALUE) return filter.emptyLabel ?? 'None'

  return filter.formatValue ? filter.formatValue(value) : value
}

function readSortingFromUrl(sortParam: string): SortingState {
  if (typeof window === 'undefined') return []

  const value = new URLSearchParams(window.location.search).get(sortParam)
  if (!value) return []

  const separatorIndex = value.lastIndexOf('.')
  if (separatorIndex <= 0) return []

  const id = value.slice(0, separatorIndex)
  const direction = value.slice(separatorIndex + 1)
  if (direction !== 'asc' && direction !== 'desc') return []

  return [{ id, desc: direction === 'desc' }]
}

function replaceSortingInUrl(sortParam: string, sorting: SortingState) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const sort = sorting.at(0)

  if (sort) {
    url.searchParams.set(sortParam, `${sort.id}.${sort.desc ? 'desc' : 'asc'}`)
  } else {
    url.searchParams.delete(sortParam)
  }

  window.history.replaceState(
    window.history.state,
    '',
    `${url.pathname}${url.search}${url.hash}`,
  )
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: {
  column: Column<TData, TValue>
  title: string
  className?: string
}) {
  const sorting = useContext(DataTableSortContext)

  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>
  }

  const sort = sorting.find((item) => item.id === column.id)
  const sorted = sort ? (sort.desc ? 'desc' : 'asc') : false

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('-ml-3', className)}
      onClick={() => column.toggleSorting()}
    >
      {title}
      {sorted === 'desc' ? (
        <ArrowDownIcon data-icon="inline-end" />
      ) : sorted === 'asc' ? (
        <ArrowUpIcon data-icon="inline-end" />
      ) : (
        <ChevronsUpDownIcon data-icon="inline-end" />
      )}
    </Button>
  )
}
