import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingPage } from '../pages/BookingPage'
import { BookingProvider } from '../features/bookings/BookingContext'
import * as bookingsApi from '../api/bookings'
import * as scheduleApi from '../api/schedule'
import * as trainersApi from '../api/trainers'
import type { Booking, TimeSlot } from '../types/domain'

vi.mock('../api/profile', () => ({
  getProfileData: vi.fn().mockResolvedValue({
    user: { id: 'u-1', name: 'Иван', role: 'client' },
    membership: { status: 'active', remainingVisits: 10 },
  }),
}))

const mockSlot: TimeSlot = {
  id: 'slot-101',
  dateId: '2026-09-12',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  startAt: '11:00',
  endAt: '12:00',
  startIso: '2026-09-12T11:00:00+03:00',
  endIso: '2026-09-12T12:00:00+03:00',
  capacity: 8,
  occupied: 2,
  isBlocked: false,
}

const mockBooking: Booking = {
  id: 'b-101',
  slotId: 'slot-101',
  userId: 'u-1',
  clientName: 'Иван',
  title: 'Самостоятельная тренировка',
  startAt: '11:00',
  endAt: '12:00',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  trainerName: null,
  trainerId: null,
  status: 'confirmed',
  createdAt: '2026-09-12T09:00:00Z',
  cancelledAt: null,
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe('M05 Booking and Details Flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))
    vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
      days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
      slots: [mockSlot],
    })
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue([
      { id: 'dima', name: 'Дмитрий Волков', specialties: ['Силовой тренинг'], about: 'Тренер по силовому тренингу' },
    ])
    vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'createBooking').mockResolvedValue(mockBooking)
    vi.spyOn(bookingsApi, 'cancelBooking').mockResolvedValue({ ...mockBooking, status: 'cancelled' })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('decouples cache outcome from unmount: commits booking to query cache even if unmounted before mutation finishes', async () => {
    let resolveCreate: (b: Booking) => void = () => {}
    const createPromise = new Promise<Booking>((resolve) => {
      resolveCreate = resolve
    })
    vi.spyOn(bookingsApi, 'createBooking').mockImplementation(() => createPromise)

    const queryClient = createTestQueryClient()
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-101']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })
    fireEvent.click(submitBtn)

    // Unmount immediately while mutation is still pending
    unmount()

    // Resolve API call after component unmount
    await act(async () => {
      resolveCreate(mockBooking)
      await createPromise
    })

    // Verify queryClient cache has received the booking
    const cachedBookings = queryClient.getQueryData<Booking[]>(['bookings'])
    expect(cachedBookings).toBeDefined()
    expect(cachedBookings?.some((b) => b.id === 'b-101')).toBe(true)
  })

  it('preserves cached booking when unmounted at 100ms into confirmed 350ms hold', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))

    const queryClient = createTestQueryClient()
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-101']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })

    // Switch to full fake timers for fine-grained timing
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))

    fireEvent.click(submitBtn)
    await act(async () => {
      await Promise.resolve()
    })

    // Now in confirmed phase
    expect(screen.getByRole('button', { name: /Запись подтверждена/i })).toBeTruthy()

    // Advance 100ms (less than 350ms)
    act(() => {
      vi.advanceTimersByTime(100)
    })

    // Unmount before 350ms timeout fires
    unmount()

    // Advancing past 350ms should not throw any unmounted setState errors
    act(() => {
      vi.advanceTimersByTime(300)
    })

    // Verify cache remains intact
    const cachedBookings = queryClient.getQueryData<Booking[]>(['bookings'])
    expect(cachedBookings?.find((b) => b.id === 'b-101')).toBeDefined()
  })

  it('disambiguates route ID: cancelled booking matching slotId does not block booking form', async () => {
    const cancelledBookingForSlot: Booking = {
      ...mockBooking,
      id: 'old-b-1',
      slotId: 'slot-101',
      status: 'cancelled',
    }
    vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([cancelledBookingForSlot])

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/training/slot-101']}>
            <Routes>
              <Route path="/training/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    // Should display the booking form for slot-101, NOT the details of the cancelled booking
    const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })
    expect(submitBtn).toBeTruthy()
    expect(screen.queryByText(/Запись отменена/i)).toBeNull()
  })

  it('renders native accessible radio inputs for booking mode with keyboard support', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-101']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    const selfRadio = (await screen.findByRole('radio', { name: /Самостоятельно/i })) as HTMLInputElement
    const trainerRadio = (await screen.findByRole('radio', { name: /Дмитрий Волков/i })) as HTMLInputElement

    expect(selfRadio).toBeTruthy()
    expect(trainerRadio).toBeTruthy()
    expect(selfRadio.checked).toBe(true)
    expect(trainerRadio.checked).toBe(false)

    // Switch to trainer
    fireEvent.click(trainerRadio)
    expect(trainerRadio.checked).toBe(true)
    expect(selfRadio.checked).toBe(false)
  })

  it('shows error retry UI when trainers fail to load', async () => {
    vi.spyOn(trainersApi, 'getTrainers').mockRejectedValue(new Error('Network error'))

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-101']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    expect(await screen.findByText(/Не удалось загрузить список тренеров/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Повторить загрузку тренеров/i })).toBeTruthy()
  })

  describe('Status calculations for Details view', () => {
    it('shows "Запись подтверждена" for upcoming booking (now < startAt)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-12T10:00:00+03:00')) // 1 hour before 11:00

      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([mockBooking])

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      expect(await screen.findByText('Запись подтверждена')).toBeTruthy()
    })

    it('shows "Тренировка идёт сейчас" for ongoing booking (startAt <= now < endAt)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-12T11:30:00+03:00')) // Middle of 11:00-12:00

      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([mockBooking])

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      expect(await screen.findByText('Тренировка идёт сейчас')).toBeTruthy()
      expect(screen.queryByText('Тренировка завершена')).toBeNull()
    })

    it('shows "Тренировка завершена" for completed booking (now >= endAt)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-12T12:05:00+03:00')) // 5 mins after 12:00

      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([mockBooking])

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      expect(await screen.findByText('Тренировка завершена')).toBeTruthy()
    })

    it('shows "Запись отменена" and ensures aria-label does not say "подтверждена"', async () => {
      const cancelledBooking: Booking = {
        ...mockBooking,
        status: 'cancelled',
        cancelledAt: '2026-09-12T09:30:00Z',
      }
      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([cancelledBooking])

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      const statusEl = await screen.findByText('Запись отменена')
      expect(statusEl).toBeTruthy()
      const mainContainer = screen.getByLabelText(/отмененная тренировка/i)
      expect(mainContainer).toBeTruthy()
      const ariaLabel = mainContainer.getAttribute('aria-label') || ''
      expect(ariaLabel.toLowerCase()).not.toContain('подтвержденная')
      expect(ariaLabel.toLowerCase()).toContain('отмененная')
    })
  })

  describe('Cancellation modal flow', () => {
    it('keeps modal open and displays inline error if cancel API rejects', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-12T05:00:00+03:00')) // More than 4h before 11:00

      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([mockBooking])
      vi.spyOn(bookingsApi, 'cancelBooking').mockRejectedValue(new Error('Сетевая ошибка отмены'))

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      const cancelBtn = await screen.findByRole('button', { name: /Отменить запись/i })
      fireEvent.click(cancelBtn)

      // Modal is open
      const dialog = await screen.findByRole('dialog')
      expect(dialog).toBeTruthy()

      const modalConfirmBtn = dialog.querySelector('.button--danger') as HTMLButtonElement
      expect(modalConfirmBtn).toBeTruthy()

      // Click confirm cancel
      fireEvent.click(modalConfirmBtn)

      // Modal should remain open and show inline error
      await waitFor(() => {
        const modalAlert = dialog.querySelector('.inline-error')
        expect(modalAlert).toBeTruthy()
        expect(modalAlert?.textContent).toContain('Сетевая ошибка отмены')
      })
      expect(screen.getByRole('dialog')).toBeTruthy()
    })

    it('prevents duplicate clicks while cancellation is pending and closes on success', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-09-12T05:00:00+03:00'))

      vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([mockBooking])

      let resolveCancel: (b: Booking) => void = () => {}
      const cancelPromise = new Promise<Booking>((resolve) => {
        resolveCancel = resolve
      })
      vi.spyOn(bookingsApi, 'cancelBooking').mockImplementation(() => cancelPromise)

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <BookingProvider>
            <MemoryRouter initialEntries={['/training/b-101']}>
              <Routes>
                <Route path="/training/:id" element={<BookingPage />} />
              </Routes>
            </MemoryRouter>
          </BookingProvider>
        </QueryClientProvider>
      )

      const cancelBtn = await screen.findByRole('button', { name: /Отменить запись/i })
      fireEvent.click(cancelBtn)

      const dialog = await screen.findByRole('dialog')
      const modalConfirmBtn = dialog.querySelector('.button--danger') as HTMLButtonElement
      fireEvent.click(modalConfirmBtn)

      // While pending, button should be disabled
      await waitFor(() => {
        expect(modalConfirmBtn.disabled).toBe(true)
      })

      // Resolve cancel
      await act(async () => {
        resolveCancel({ ...mockBooking, status: 'cancelled' })
        await cancelPromise
      })

      // Modal should close, view updates to cancelled status
      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull()
      })
      expect(screen.getByText('Запись отменена')).toBeTruthy()
    })

    describe('R3 Remediation Regressions', () => {
      it('retains 350ms confirmed phase when live availability jumps to full (8/8) after submission (R3-01)', async () => {
        const fullSlot: TimeSlot = { ...mockSlot, occupied: 7, capacity: 8 }
        vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
          days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
          slots: [fullSlot],
        })
        vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([])
        vi.spyOn(bookingsApi, 'createBooking').mockImplementation(async (slot) => {
          // Live refetch happens and slot becomes 8/8 full
          vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
            days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
            slots: [{ ...fullSlot, occupied: 8 }],
          })
          return {
            ...mockBooking,
            id: 'b-999',
            slotId: slot.id,
            status: 'confirmed',
          }
        })

        const queryClient = createTestQueryClient()
        render(
          <QueryClientProvider client={queryClient}>
            <BookingProvider>
              <MemoryRouter initialEntries={['/booking/slot-101']}>
                <Routes>
                  <Route path="/booking/:id" element={<BookingPage />} />
                </Routes>
              </MemoryRouter>
            </BookingProvider>
          </QueryClientProvider>
        )

        const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })
        fireEvent.click(submitBtn)

        // During the 350ms hold, it must display "✓ Запись подтверждена" and NOT "Все места заняты"
        await waitFor(() => {
          expect(screen.getByText('✓ Запись подтверждена')).toBeTruthy()
        })
        expect(screen.queryByText(/Все места заняты/i)).toBeNull()
      })

      it('defaults to self booking and sends self payload when requested trainer is not in roster (R3-02)', async () => {
        // Empty trainers roster
        vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue([])
        vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([])
        const createSpy = vi.spyOn(bookingsApi, 'createBooking').mockResolvedValue(mockBooking)

        const queryClient = createTestQueryClient()
        render(
          <QueryClientProvider client={queryClient}>
            <BookingProvider>
              <MemoryRouter initialEntries={['/booking/slot-101?trainer=dima']}>
                <Routes>
                  <Route path="/booking/:id" element={<BookingPage />} />
                </Routes>
              </MemoryRouter>
            </BookingProvider>
          </QueryClientProvider>
        )

        const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })
        const selfRadio = screen.getByRole('radio', { name: /Самостоятельно/i }) as HTMLInputElement
        expect(selfRadio.checked).toBe(true)

        fireEvent.click(submitBtn)

        await waitFor(() => {
          expect(createSpy).toHaveBeenCalledWith(expect.anything(), 'self')
        })
      })
    })
  })
})
