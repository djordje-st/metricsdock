import type { ComponentProps } from 'react'

import { cn } from '#/lib/utils.ts'

type MetricsDockLogoProps = Omit<ComponentProps<'img'>, 'src'>

export function MetricsDockLogo({
  alt = '',
  className,
  ...props
}: MetricsDockLogoProps) {
  return (
    <img
      {...props}
      src="/logo.png"
      alt={alt}
      aria-hidden={alt ? undefined : true}
      className={cn('size-8 shrink-0 object-contain', className)}
    />
  )
}
