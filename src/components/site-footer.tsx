import { Link } from '@tanstack/react-router'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background px-4 py-8 text-sm text-muted-foreground lg:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p>Copyright 2026 MetricsDock. All rights reserved.</p>
        <nav aria-label="Footer navigation" className="flex items-center gap-5">
          <Link
            to="/privacy"
            className="font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  )
}
