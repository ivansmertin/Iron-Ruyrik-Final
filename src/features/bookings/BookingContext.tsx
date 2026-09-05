/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

interface BookingContextValue {
  notice: string | null
  showNotice: (message: string) => void
  clearNotice: () => void
}

const BookingContext = createContext<BookingContextValue | null>(null)

export function BookingProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<string | null>(null)
  const showNotice = useCallback((message: string) => setNotice(message), [])
  const clearNotice = useCallback(() => setNotice(null), [])
  const value = useMemo(() => ({ notice, showNotice, clearNotice }), [notice, showNotice, clearNotice])
  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>
}

export function useBookings() {
  const context = useContext(BookingContext)
  if (!context) throw new Error('useBookings must be used inside BookingProvider')
  return context
}
