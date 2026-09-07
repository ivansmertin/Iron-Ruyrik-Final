import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`button button--${variant} ${className}`} {...props} />
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: LinkProps & { variant?: ButtonVariant }) {
  return <Link className={`button button--${variant} ${className}`} {...props} />
}

export { Modal } from './Modal'

/**
 * Legacy Card wrapper retained for progressive migration.
 * Deprecated for new screens in favor of Section + Divider + Typography.
 */
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />
}

/**
 * Cardless Section Primitive
 * Provides airy layout structure without enclosing 4-sided borders.
 */
export function Section({
  spacious = false,
  hasDividerBottom = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLElement> & {
  spacious?: boolean
  hasDividerBottom?: boolean
}) {
  return (
    <section
      className={`ui-section ${spacious ? 'ui-section--spacious' : ''} ${
        hasDividerBottom ? 'has-divider-bottom' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </section>
  )
}

/**
 * 1px Architectural Divider
 * By default decorative (aria-hidden="true") to avoid announcing lines to screen readers.
 * When decorative={false}, renders role="separator" with aria-orientation.
 */
export function Divider({
  variant = 'subtle',
  orientation = 'horizontal',
  decorative = true,
  className = '',
}: {
  variant?: 'subtle' | 'strong' | 'accent'
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  className?: string
}) {
  const variantClass =
    variant === 'strong'
      ? 'divider--strong'
      : variant === 'accent'
        ? 'divider--accent'
        : ''
  const orientationClass = orientation === 'vertical' ? 'divider--vertical' : ''

  if (decorative) {
    return (
      <div
        aria-hidden="true"
        className={`divider ${variantClass} ${orientationClass} ${className}`.trim()}
      />
    )
  }

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`divider ${variantClass} ${orientationClass} ${className}`.trim()}
    />
  )
}

export function PageHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string
  title: string
  action?: ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function SectionHeader({
  title,
  eyebrow,
  detail,
  className = '',
}: {
  title: string
  eyebrow?: string
  detail?: ReactNode
  className?: string
}) {
  return (
    <div className={`ui-section-header ${className}`}>
      <div>
        {eyebrow && <p className="ui-section-header__eyebrow">{eyebrow}</p>}
        <h2 className="ui-section-header__title">{title}</h2>
      </div>
      {detail}
    </div>
  )
}

/**
 * HeroMetric Primitive
 * Large typographic metric without enclosing cards.
 */
export function HeroMetric({
  eyebrow,
  value,
  unit,
  detail,
  className = '',
}: {
  eyebrow?: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  className?: string
}) {
  return (
    <div className={`hero-metric ${className}`}>
      {eyebrow && <span className="hero-metric__eyebrow">{eyebrow}</span>}
      <div className="hero-metric__value-row">
        <strong className="hero-metric__value">{value}</strong>
        {unit && <span className="hero-metric__unit">{unit}</span>}
        {detail && <div className="hero-metric__delta">{detail}</div>}
      </div>
    </div>
  )
}

/**
 * InteractiveRow Primitives
 * Clean border-bottom interactive row without enclosing card.
 */
export function InteractiveRow({
  isSelected = false,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { isSelected?: boolean }) {
  return (
    <button
      type="button"
      className={`interactive-row ${isSelected ? 'is-selected' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function InteractiveRowLink({
  isSelected = false,
  className = '',
  children,
  ...props
}: LinkProps & { isSelected?: boolean }) {
  return (
    <Link
      className={`interactive-row ${isSelected ? 'is-selected' : ''} ${className}`}
      {...props}
    >
      {children}
    </Link>
  )
}

/**
 * Metadata Primitive
 * Typography-first secondary info row or inline label/value pairs.
 */
export function Metadata({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`metadata-text ${className}`}>{children}</div>
}

/**
 * StatusText Primitive
 * Clean typography-first status indicators (replaces decorative candy pills).
 */
export function StatusText({
  tone = 'neutral',
  dot = false,
  icon,
  children,
  className = '',
}: {
  tone?: 'positive' | 'warning' | 'danger' | 'neutral'
  dot?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`status-text status-text--${tone} ${className}`}>
      {dot && <span className="status-dot" aria-hidden="true" />}
      {icon}
      <span>{children}</span>
    </span>
  )
}

/**
 * StatusBadge Primitive
 * Reserved only for true status/category state; small, restrained, non-candy.
 */
export function StatusBadge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: 'positive' | 'warning' | 'danger' | 'neutral'
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`status-badge status-badge--${tone} ${className}`}>
      {children}
    </span>
  )
}

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`skeleton ${className}`} aria-hidden="true" {...props} />
}

export function LoadingPage({ label = 'Загружаем данные' }: { label?: string }) {
  return (
    <div className="loading-stack" aria-label={label} aria-busy="true">
      <Skeleton className="skeleton--title" />
      <Skeleton className="skeleton--hero" />
      <Skeleton className="skeleton--row" />
      <Skeleton className="skeleton--row" />
    </div>
  )
}
