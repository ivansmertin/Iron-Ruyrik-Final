import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

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

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />
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
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  )
}

export function SectionHeader({ title, detail }: { title: string; detail?: ReactNode }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {detail}
    </div>
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
