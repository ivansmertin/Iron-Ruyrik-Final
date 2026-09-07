import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminPage } from '../pages/AdminPage'
import { BookingPage } from '../pages/BookingPage'
import { BookingProvider } from '../features/bookings/BookingContext'
import { clearModalStack, getModalStackDepth, popModal } from '../services/modalStack'

// Mocks for AdminPage API dependencies
vi.mock('../api/admin', () => ({
  getAdminSettings: vi.fn().mockResolvedValue({ gymCapacity: 8 }),
  getAdminBookings: vi.fn().mockResolvedValue([]),
  getBookingBlocks: vi.fn().mockResolvedValue([]),
  patchAdminSettings: vi.fn().mockResolvedValue({ gymCapacity: 8 }),
  createBookingBlock: vi.fn().mockResolvedValue({ id: 'block-1' }),
  deleteBookingBlock: vi.fn().mockResolvedValue(true),
  addAdminBooking: vi.fn().mockResolvedValue({ id: 'b-new' }),
}))

vi.mock('../api/profile', () => ({
  getProfileData: vi.fn().mockResolvedValue({
    user: { id: 'u-1', name: 'Админ', role: 'admin' },
    membership: { status: 'active', remainingVisits: 10 },
  }),
}))

// Mocks for BookingPage API dependencies
vi.mock('../api/schedule', () => ({
  getScheduleData: vi.fn().mockResolvedValue({
    days: [{ id: '2026-09-08', day: 8, weekday: 'ВТ', monthLabel: 'сентября' }],
    slots: [
      {
        id: 's-1',
        dateId: '2026-09-08',
        date: '2026-09-08',
        dateLabel: 'Завтра',
        startAt: '11:00',
        endAt: '12:00',
        startIso: '2026-09-08T11:00:00+03:00',
        endIso: '2026-09-08T12:00:00+03:00',
        capacity: 8,
        occupied: 2,
        isBlocked: false,
      },
    ],
  }),
}))

vi.mock('../api/trainers', () => ({
  getTrainers: vi.fn().mockResolvedValue([]),
}))

const { mockCreatedBooking } = vi.hoisted(() => ({
  mockCreatedBooking: {
    id: 'b-1',
    slotId: 's-1',
    userId: 'u-1',
    clientName: 'Алексей',
    title: 'Самостоятельная тренировка',
    startAt: '11:00',
    endAt: '12:00',
    date: '2026-09-08',
    dateLabel: 'Завтра',
    trainerName: null,
    trainerId: null,
    status: 'confirmed' as const,
    createdAt: '2026-09-08T10:00:00Z',
    cancelledAt: null,
  },
}))

vi.mock('../api/bookings', () => ({
  getBookings: vi.fn().mockResolvedValue([]),
  createBooking: vi.fn().mockResolvedValue(mockCreatedBooking),
  cancelBooking: vi.fn().mockResolvedValue({ ...mockCreatedBooking, status: 'cancelled' }),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe('Codex P1 Remediation Verification', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('P1 #1A: Booking Confirmed Phase Timing', () => {
    it('holds confirmed phase (✓ Запись подтверждена) for 350ms before transitioning to details view', async () => {
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/booking/s-1']}>
              <Routes>
                <Route path="/booking/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      // 1. Wait for slot to load and find submit button
      const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })
      expect(submitBtn).toBeDefined()
      expect(submitBtn.hasAttribute('disabled')).toBe(false)

      // Ensure details view is not yet present
      expect(screen.queryByText(/ВАША ТРЕНИРОВКА/i)).toBeNull()

      // 2. Setup fake timers and trigger booking creation
      vi.useFakeTimers()

      await act(async () => {
        fireEvent.click(submitBtn)
        // Let mutation promise resolve
        await Promise.resolve()
      })

      // 3. Right after mutation resolves:
      // - The button must display '✓ Запись подтверждена'
      // - The button must be disabled
      // - The details view ('ВАША ТРЕНИРОВКА') MUST NOT BE SHOWN YET
      expect(screen.getByText(/✓ Запись подтверждена/i)).toBeDefined()
      expect(submitBtn.hasAttribute('disabled')).toBe(true)
      expect(screen.queryByText(/ВАША ТРЕНИРОВКА/i)).toBeNull()

      // 4. Advance 150ms (less than 350ms):
      // - Confirmed state MUST PERSIST without premature flip
      act(() => {
        vi.advanceTimersByTime(150)
      })
      expect(screen.getByText(/✓ Запись подтверждена/i)).toBeDefined()
      expect(screen.queryByText(/ВАША ТРЕНИРОВКА/i)).toBeNull()

      // 5. Advance another 200ms (total 350ms):
      // - Timer expires: cache committed, safeStartViewTransition called, details view rendered
      act(() => {
        vi.advanceTimersByTime(200)
      })

      // Now details view is rendered!
      expect(screen.getByText(/ВАША ТРЕНИРОВКА/i)).toBeDefined()
      expect(screen.getByText(/Отменить запись/i)).toBeDefined()

      // Check query cache was updated with the new booking
      const cachedBookings = queryClient.getQueryData<typeof mockCreatedBooking[]>(['bookings'])
      expect(cachedBookings).toBeDefined()
      expect(cachedBookings?.some((b) => b.id === 'b-1')).toBe(true)
    })
  })

  describe('P1 #2: Admin Modal Contract & Native Android Back', () => {
    it('integrates Admin modal with shared Modal component and modalStack LIFO lifecycle', async () => {
      const queryClient = createTestQueryClient()

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin']}>
            <AdminPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // 1. Initial state: modal is closed, modalStack depth is 0
      const openBtn = await screen.findByRole('button', { name: /Записать клиента/i })
      expect(openBtn).toBeDefined()
      expect(getModalStackDepth()).toBe(0)
      expect(screen.queryByRole('dialog')).toBeNull()

      // 2. Focus trigger button and open modal
      openBtn.focus()
      expect(document.activeElement).toBe(openBtn)

      act(() => {
        fireEvent.click(openBtn)
      })

      // Dialog is open and registered in modalStack
      const dialog = screen.getByRole('dialog')
      expect(dialog).toBeDefined()
      expect(dialog.getAttribute('aria-modal')).toBe('true')
      expect(dialog.getAttribute('aria-labelledby')).toBe('add-client-title')
      expect(screen.getByRole('heading', { level: 2, name: 'Записать клиента' })).toBeDefined()
      expect(getModalStackDepth()).toBe(1)

      // 3. Test Android hardware Back via popModal()
      let handled = false
      act(() => {
        handled = popModal()
      })
      expect(handled).toBe(true)
      expect(getModalStackDepth()).toBe(0)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(openBtn)

      // 4. Re-open modal and test closing via Escape key
      act(() => {
        fireEvent.click(openBtn)
      })
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(getModalStackDepth()).toBe(1)

      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' })
      })
      expect(getModalStackDepth()).toBe(0)
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(document.activeElement).toBe(openBtn)
    })
  })
})
