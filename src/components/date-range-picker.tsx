import { useEffect, useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Calendar } from '#/components/ui/calendar.tsx'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover.tsx'
import { Button } from '#/components/ui/button.tsx'
import type { DateRangeValue } from '#/lib/date-range.ts'
import {
  getTrailingDateRange,
  parseDateKey,
  toDateKey,
} from '#/lib/date-range.ts'
import { formatDate } from '#/lib/format.ts'
import { cn } from '#/lib/utils.ts'

type DateRangePickerProps = {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  className?: string
}

const presets = [
  { label: 'Today', days: 1 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 60 days', days: 60 },
] as const

export function DateRangePicker({
  value,
  onChange,
  className,
}: DateRangePickerProps) {
  const [selected, setSelected] = useState<DateRange>(() => toSelected(value))
  const today = getToday()

  useEffect(() => {
    setSelected(toSelected(value))
  }, [value.startDate, value.endDate])

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={cn('w-full justify-start sm:w-auto', className)}
          />
        }
      >
        <CalendarIcon data-icon="inline-start" />
        {formatDate(value.startDate)} - {formatDate(value.endDate)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <div className="flex gap-1 border-b p-2 sm:w-36 sm:flex-col sm:border-r sm:border-b-0">
            {presets.map((preset) => {
              const range = getTrailingDateRange(preset.days, today)
              const isActive =
                value.startDate === range.startDate &&
                value.endDate === range.endDate

              return (
                <Button
                  key={preset.days}
                  type="button"
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className="justify-start"
                  onClick={() => {
                    setSelected(toSelected(range))
                    onChange(range)
                  }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>
          <Calendar
            mode="range"
            selected={selected}
            disabled={{ after: today }}
            endMonth={today}
            onSelect={(range) => {
              setSelected(range ?? { from: undefined, to: undefined })

              if (range?.from && range.to) {
                onChange({
                  startDate: toDateKey(range.from),
                  endDate: toDateKey(range.to),
                })
              }
            }}
            numberOfMonths={2}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getToday() {
  const today = new Date()

  return new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

function toSelected(value: DateRangeValue): DateRange {
  return {
    from: parseDateKey(value.startDate),
    to: parseDateKey(value.endDate),
  }
}
