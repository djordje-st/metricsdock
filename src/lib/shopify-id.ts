const partnerGidPattern = /^gid:\/\/partners\/[^/]+\/(.+)$/

export function formatShopifyId(
  value: string | null | undefined,
  fallback = '-',
) {
  const id = value?.trim()
  if (!id) return fallback

  return partnerGidPattern.exec(id)?.[1] ?? id
}

export function toPartnerAppGid(value: string) {
  return `gid://partners/App/${formatShopifyId(value, '')}`
}
