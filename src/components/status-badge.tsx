import { Badge } from '#/components/ui/badge.tsx'
import type { BadgeVariant } from '#/components/ui/badge.tsx'

function statusVariant(status: string): BadgeVariant {
  const value = status.toLowerCase().replaceAll('-', '_').replaceAll(' ', '_')

  if (
    value.includes('unhealthy') ||
    value.includes('uninstall') ||
    value.includes('cancel') ||
    value.includes('deactivat') ||
    value.includes('fail') ||
    value.includes('error')
  ) {
    return 'destructive'
  }

  if (value.includes('inactive') || value.includes('not_installed')) {
    return 'warning'
  }

  if (
    value.includes('healthy') ||
    value.includes('active') ||
    value.includes('install') ||
    value.includes('complete') ||
    value.includes('success')
  ) {
    return 'success'
  }

  if (
    value.includes('accept') ||
    value.includes('missing') ||
    value.includes('not_synced') ||
    value.includes('pending') ||
    value.includes('scope') ||
    value.includes('skipped') ||
    value.includes('stale') ||
    value.includes('trial') ||
    value.includes('warn')
  ) {
    return 'warning'
  }

  if (
    value.includes('running') ||
    value.includes('queued') ||
    value.includes('waiting') ||
    value.includes('delayed') ||
    value.includes('sync')
  ) {
    return 'info'
  }

  return 'outline'
}

function statusLabel(status: string) {
  return status
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ')
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{statusLabel(status)}</Badge>
}
