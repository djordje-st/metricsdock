export const UNSPECIFIED_UNINSTALL_REASON = 'Unspecified'
export const OTHER_UNINSTALL_REASON = 'Other'

const REASON_PATTERNS = [
  {
    label: 'Too expensive',
    patterns: [
      'cost',
      'costly',
      'expensive',
      'price',
      'pricing',
      'caro',
      'cher',
      'kosten',
      'preis',
      'teuer',
    ],
  },
  {
    label: 'Missing features',
    patterns: [
      'feature',
      'functionality',
      'missing',
      'capability',
      'falta',
      'faltan',
      'fonctionnalite',
      'funktion',
    ],
  },
  {
    label: 'Difficult to use',
    patterns: [
      'confusing',
      'complicated',
      'complex',
      'difficult',
      'hard to use',
      'not easy',
      'dificil',
      'difficile',
      'kompliziert',
      'schwer',
    ],
  },
  {
    label: 'Not using the app',
    patterns: [
      'dont need',
      'do not need',
      'no longer need',
      'no longer use',
      'not needed',
      'not using',
      'unused',
      'nicht mehr',
      'no necesito',
      'nao preciso',
    ],
  },
  {
    label: 'Switched to another app',
    patterns: [
      'another app',
      'alternative',
      'competitor',
      'migrate',
      'migration',
      'replaced',
      'switch',
      'autre application',
      'andere app',
      'otra app',
      'outro app',
    ],
  },
  {
    label: 'Not working as expected',
    patterns: [
      'bug',
      'broken',
      'error',
      'issue',
      'not work',
      'problem',
      'technical',
      'fehler',
      'problema',
      'probleme',
    ],
  },
  {
    label: 'Poor support',
    patterns: [
      'customer service',
      'help',
      'poor support',
      'support',
      'kundendienst',
      'soporte',
      'supporto',
    ],
  },
  {
    label: 'Testing only',
    patterns: ['demo', 'test', 'testing', 'trial', 'essai', 'prueba'],
  },
] as const

export function normalizeUninstallReasons(reason: string | null | undefined) {
  const rawReasons = splitReasons(reason)
  const categories = unique(
    rawReasons.map(classifyReason).filter((value) => value.length > 0),
  )

  if (!categories.length) {
    categories.push(UNSPECIFIED_UNINSTALL_REASON)
  }

  return {
    categories,
    reason: categories.join(', '),
    rawReason: rawReasons.join(', ') || null,
  }
}

export function readUninstallComment(
  properties: Record<string, unknown>,
): string | undefined {
  for (const field of ['description', 'feedback', 'comment', 'comments']) {
    const value = properties[field]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
}

function classifyReason(reason: string) {
  const key = normalizeReasonKey(reason)

  if (!key) return ''
  if (key === 'other') return OTHER_UNINSTALL_REASON
  if (key === 'unknown' || key === 'unspecified') {
    return UNSPECIFIED_UNINSTALL_REASON
  }

  const match = REASON_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => key.includes(pattern)),
  )

  return match?.label ?? OTHER_UNINSTALL_REASON
}

function splitReasons(reason: string | null | undefined) {
  return (reason ?? '')
    .split(/[,;|\n]/)
    .map((value) => value.trim())
    .filter(Boolean)
}

function normalizeReasonKey(reason: string) {
  return reason
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function unique(values: string[]) {
  return [...new Set(values)]
}
