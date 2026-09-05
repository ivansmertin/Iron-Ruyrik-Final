import { Outlet } from 'react-router-dom'
import { useBookings } from '../features/bookings/BookingContext'
import { BrandLogo } from './BrandLogo'
import { MobileBottomNav } from './Navigation'
import { Toast } from './Toast'

export function AppShell() {
  const { notice, clearNotice } = useBookings()
  return (
    <div className="mobile-app-viewport">
      <div className="app-shell">
        <header className="mobile-header">
          <BrandLogo />
        </header>
        <main className="app-content" id="main-content">
          <Outlet />
        </main>
        <MobileBottomNav />
        <Toast message={notice} onDismiss={clearNotice} />
      </div>
    </div>
  )
}
