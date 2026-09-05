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
