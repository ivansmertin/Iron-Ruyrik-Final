import {
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Home,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

const clientNavigation = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/schedule', label: 'Запись', icon: CalendarDays },
  { to: '/trainers', label: 'Тренеры', icon: UsersRound },
  { to: '/progress', label: 'Прогресс', icon: ChartNoAxesColumnIncreasing },
  { to: '/profile', label: 'Профиль', icon: UserRound },
]

export function MobileBottomNav() {
  const location = useLocation()
  const pathname = location.pathname

  const isTabActive = (to: string) => {
    if (to === '/') return pathname === '/'
    if (to === '/schedule') return pathname.startsWith('/schedule') || pathname.startsWith('/booking')
    if (to === '/trainers') return pathname.startsWith('/trainers')
    if (to === '/progress') return pathname.startsWith('/progress')
    if (to === '/profile') return pathname.startsWith('/profile') || pathname.startsWith('/integrations')
    return false
  }

  const activeIndex = clientNavigation.findIndex(({ to }) => isTabActive(to))

  return (
    <nav className="mobile-nav" aria-label="Основная навигация">
      {activeIndex >= 0 && (
        <span
          className="mobile-nav__indicator"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
          }}
          aria-hidden="true"
        />
      )}
      {clientNavigation.map(({ to, label, icon: Icon }) => {
        const active = isTabActive(to)
        return (
          <Link
            key={to}
            to={to}
            className={`mobile-nav__item ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={21} className="mobile-nav__icon" aria-hidden="true" />
            <span className="mobile-nav__label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
