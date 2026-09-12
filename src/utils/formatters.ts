/**
 * Russian pluralization helper
 * pluralize(1, 'тренировка', 'тренировки', 'тренировок') -> 'тренировка'
 * pluralize(3, 'тренировка', 'тренировки', 'тренировок') -> 'тренировки'
 * pluralize(5, 'тренировка', 'тренировки', 'тренировок') -> 'тренировок'
 */
export function pluralize(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(Math.floor(n)) % 100
  const rem = abs % 10
  if (abs > 10 && abs < 20) return many
  if (rem > 1 && rem < 5) return few
  if (rem === 1) return one
  return many
}

/**
 * Format decimal numbers using Russian locale comma separator
 * formatDecimal(78.2) -> '78,2'
 */
export function formatDecimal(value: number, digits = 1): string {
  return value.toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/**
 * Format date in Russian, e.g. "1 июня" or "20 мая"
 */
export function formatDateRu(dateStr: string, format: 'short' | 'long' = 'short'): string {
  try {
    const normalized = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return dateStr
    if (format === 'short') {
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  } catch {
    return dateStr
  }
}

/**
 * Format full date and time in Russian, e.g. "8 сентября 2026, 08:30" or "8 сентября 2026"
 */
export function formatDateTimeRu(dateStr: string): string {
  try {
    const trimmed = dateStr.trim()
    const isDayOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    const d = isDayOnly ? new Date(`${trimmed}T12:00:00`) : new Date(trimmed)
    if (isNaN(d.getTime())) return dateStr

    const dateFormatted = d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })

    if (isDayOnly) {
      return dateFormatted
    }

    const timeFormatted = d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })

    return `${dateFormatted}, ${timeFormatted}`
  } catch {
    return dateStr
  }
}

export interface DeltaInfo {
  diff: number
  formatted: string
  direction: 'up' | 'down' | 'neutral'
  label: string
}

/**
 * Calculate delta between current value and baseline
 * Uses typographic minus sign (−) and Russian comma
 */
export function calculateDelta(
  current: number,
  baseline: number,
  unit = '',
  baselineDateStr?: string
): DeltaInfo {
  const diff = Math.round((current - baseline) * 10) / 10
  const isZero = Math.abs(diff) < 0.05

  const sign = isZero ? '' : diff > 0 ? '+' : '−'
  const absFormatted = formatDecimal(Math.abs(diff), 1)
  const unitSuffix = unit ? ` ${unit}` : ''
  const formatted = `${sign}${absFormatted}${unitSuffix}`

  const dateNote = baselineDateStr ? ` с ${formatDateRu(baselineDateStr, 'long')}` : ''
  const label = `${formatted}${dateNote}`

  return {
    diff,
    formatted,
    direction: isZero ? 'neutral' : diff > 0 ? 'up' : 'down',
    label,
  }
}

const APP_TIMEZONE = 'Europe/Moscow'

/**
 * Format human-friendly semantic date for Hero workout:
 * "Сегодня, 8 сентября", "Завтра, 9 сентября", or "Ср, 10 сентября"
 */
export function formatHeroSemanticDate(dateStr?: string | null, isoStr?: string | null): string {
  if (!dateStr && !isoStr) return ''
  try {
    const now = new Date()
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(now)

    let datePart = dateStr?.includes('T') ? dateStr.split('T')[0] : (dateStr ?? '')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart) && isoStr) {
      datePart = new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date(isoStr))
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return dateStr ?? ''
    }

    const [ty, tm, td] = todayStr.split('-').map(Number)
    const [y, m, d] = datePart.split('-').map(Number)

    const todayUtc = Date.UTC(ty, tm - 1, td)
    const targetUtc = Date.UTC(y, m - 1, d)
    const diffDays = Math.round((targetUtc - todayUtc) / (24 * 60 * 60 * 1000))

    const dateObj = isoStr ? new Date(isoStr) : new Date(`${datePart}T12:00:00+03:00`)
    const dayMonth = new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      timeZone: APP_TIMEZONE,
    }).format(dateObj)

    if (diffDays === 0) {
      return `Сегодня, ${dayMonth}`
    }
    if (diffDays === 1) {
      return `Завтра, ${dayMonth}`
    }

    const weekdayShort = new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      timeZone: APP_TIMEZONE,
    })
      .format(dateObj)
      .replace('.', '')
    const capitalizedWeekday = weekdayShort.charAt(0).toUpperCase() + weekdayShort.slice(1)
    return `${capitalizedWeekday}, ${dayMonth}`
  } catch {
    return dateStr ?? ''
  }
}

/**
 * Clean and preserve full specialty author text, ensuring capital first letter.
 */
export function cleanSpecialty(tag: string): string {
  const trimmed = tag.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

