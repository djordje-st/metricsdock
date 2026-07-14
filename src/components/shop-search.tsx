import { Link } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'
import { SearchIcon } from 'lucide-react'
import { useDeferredValue, useEffect, useState } from 'react'
import { Card } from '#/components/ui/card.tsx'
import { Input } from '#/components/ui/input.tsx'
import { formatShopifyId } from '#/lib/shopify-id.ts'
import { cn } from '#/lib/utils.ts'
import { searchShops } from '#/server/app.functions.ts'

type ShopSuggestion = {
  id: number
  shopDomain: string
  shopName: string | null
  shopifyShopId: string | null
}

export function ShopSearch({ className }: { className?: string }) {
  const searchShopsFn = useServerFn(searchShops)
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [results, setResults] = useState<ShopSuggestion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const search = deferredQuery.trim()
    let cancelled = false

    if (!search) {
      setResults([])
      setStatus('idle')
      return
    }

    setStatus('loading')

    const timeout = window.setTimeout(() => {
      void searchShopsFn({ data: { query: search } })
        .then((shops) => {
          if (cancelled) return

          setResults(shops.slice(0, 3))
          setStatus('ready')
          setOpen(true)
        })
        .catch(() => {
          if (cancelled) return

          setResults([])
          setStatus('error')
        })
    }, 150)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [deferredQuery, searchShopsFn])

  const hasQuery = query.trim().length > 0
  const showResults = open && hasQuery

  return (
    <div className={cn('relative w-full md:max-w-sm', className)}>
      <SearchIcon
        size={16}
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
      />

      <Input
        type="search"
        value={query}
        placeholder="Search shops..."
        className="pl-8"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="shop-search-results"
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120)
        }}
      />

      {showResults ? (
        <Card
          id="shop-search-results"
          role="listbox"
          className="absolute top-10 right-0 left-0 z-50 gap-1 p-1 shadow-lg"
        >
          {status === 'loading' ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Searching...
            </div>
          ) : null}

          {status === 'ready' && results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              No shops found.
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Search failed. Try again.
            </div>
          ) : null}

          {results.map((shop) => (
            <Link
              key={shop.id}
              to="/shops/$shopId"
              params={{ shopId: String(shop.id) }}
              role="option"
              className="flex flex-col rounded-md px-3 py-2 text-sm hover:bg-muted focus:bg-muted focus:outline-none"
              onClick={() => {
                setQuery('')
                setOpen(false)
              }}
            >
              <span className="truncate font-medium">
                {shop.shopName || shop.shopDomain}
              </span>
              <span className="truncate text-muted-foreground">
                {shop.shopDomain}
                {shop.shopifyShopId
                  ? ` · ${formatShopifyId(shop.shopifyShopId)}`
                  : ''}
              </span>
            </Link>
          ))}
        </Card>
      ) : null}
    </div>
  )
}
