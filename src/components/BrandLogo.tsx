import { Link } from 'react-router-dom'

export function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={`brand-mark brand-mark--${size}`} aria-hidden="true">
      <img src="/brand-source.png" alt="" />
    </span>
  )
}

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className={`brand-logo ${compact ? 'brand-logo--compact' : ''}`} aria-label="Железный Рюрик — главная">
      <BrandMark />
      {!compact && (
        <span className="brand-wordmark" aria-hidden="true">
          <img src="/brand-lockups.png" alt="" />
        </span>
      )}
      <span className="sr-only">Железный Рюрик</span>
    </Link>
  )
}
