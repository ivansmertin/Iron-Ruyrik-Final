import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BookingCard } from '../components/BookingCard'
import { TrainerCard } from '../components/TrainerCard'
import { MobileBottomNav } from '../components/Navigation'
import { SchedulePage } from '../pages/SchedulePage'
import { BookingPage } from '../pages/BookingPage'
import { TrainerPage } from '../pages/TrainerPage'
import { BookingProvider } from '../features/bookings/BookingContext'
import { safeStartViewTransition } from '../utils/viewTransitions'
import * as bookingsApi from '../api/bookings'
import * as scheduleApi from '../api/schedule'
import * as trainersApi from '../api/trainers'
import type { Booking, TimeSlot, Trainer } from '../types/domain'

const mockTrainer: Trainer = {
  id: 'dima',
  name: 'Дима Волков',
  specialties: ['триатлон', 'бег', 'силовые'],
  about: 'Тренер по триатлону',
}

const mockSlot1: TimeSlot = {
  id: 'slot-1',
  dateId: '2026-09-12',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  startAt: '10:00',
  endAt: '11:00',
  startIso: '2026-09-12T10:00:00+03:00',
  endIso: '2026-09-12T11:00:00+03:00',
  capacity: 8,
  occupied: 2,
  isBlocked: false,
}

const mockSlot2: TimeSlot = {
  id: 'slot-2',
  dateId: '2026-09-12',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  startAt: '12:00',
  endAt: '13:00',
  startIso: '2026-09-12T12:00:00+03:00',
  endIso: '2026-09-12T13:00:00+03:00',
  capacity: 8,
  occupied: 4,
  isBlocked: false,
}

const mockBooking: Booking = {
  id: 'b-1',
  slotId: 'slot-1',
  userId: 'u-1',
  clientName: 'Иван',
  title: 'Тренировка в зале',
  startAt: '10:00',
  endAt: '11:00',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  trainerName: null,
  trainerId: null,
  status: 'confirmed',
  createdAt: '2026-09-12T08:00:00Z',
  cancelledAt: null,
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

describe('M11 — Motion Continuity & Restrained Transitions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))

    vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
      days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
      slots: [mockSlot1, mockSlot2],
    })
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue([mockTrainer])
    vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([])
    vi.spyOn(bookingsApi, 'createBooking').mockResolvedValue(mockBooking)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('Pair 1 & 2: Hero slot time assigns viewTransitionName "hero-slot-time" between Home and Booking', async () => {
    // 1. Home booking card (Available nextSlot state)
    const { unmount } = render(
      <MemoryRouter>
        <BookingCard booking={null} nextSlot={mockSlot1} />
      </MemoryRouter>
    )

    const homeTimeEl = screen.getByText('10:00–11:00')
    expect(homeTimeEl.style.viewTransitionName).toBe('hero-slot-time')

    const cta = screen.getByRole('link', { name: /Записаться/i })
    expect(cta.getAttribute('href')).toBe('/booking/slot-1')
    unmount()

    // 2. Booking page (New booking view)
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-1']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    const bookingHeroTime = await screen.findByRole('heading', { level: 1 })
    expect(bookingHeroTime.style.viewTransitionName).toBe('hero-slot-time')
    expect(bookingHeroTime.textContent).toBe('10:00–11:00')
  })

  it('Pair 2: Schedule slot dynamically receives "hero-slot-time" only on clicked slot', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/schedule?date=2026-09-12']}>
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('10:00–11:00')).toBeTruthy()
      expect(screen.getByText('12:00–13:00')).toBeTruthy()
    })

    const slot1Time = screen.getByText('10:00–11:00')
    const slot2Time = screen.getByText('12:00–13:00')

    // Initially neither has viewTransitionName (avoiding duplicate names warning in browser)
    expect(slot1Time.style.viewTransitionName).toBeFalsy()
    expect(slot2Time.style.viewTransitionName).toBeFalsy()

    // Click slot 1 link
    const slot1Link = screen.getByRole('link', { name: /Записаться на время 10:00–11:00/i })
    fireEvent.click(slot1Link)

    // Now ONLY slot 1 receives hero-slot-time
    expect(slot1Time.style.viewTransitionName).toBe('hero-slot-time')
    expect(slot2Time.style.viewTransitionName).toBeFalsy()
  })

  it('Pair 3: Trainer card and Trainer profile share matching avatar and name viewTransitionNames', async () => {
    // 1. Trainer Card in list
    const { unmount } = render(
      <MemoryRouter>
        <TrainerCard trainer={mockTrainer} />
      </MemoryRouter>
    )

    const nameInList = screen.getByRole('heading', { level: 2, name: 'Дима Волков' })
    expect(nameInList.style.viewTransitionName).toBe('trainer-name-dima')

    const avatarInList = document.querySelector('.trainer-avatar--dima') as HTMLElement
    expect(avatarInList.style.viewTransitionName).toBe('trainer-avatar-dima')
    unmount()

    // 2. Trainer Profile
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/trainers/dima']}>
          <Routes>
            <Route path="/trainers/:id" element={<TrainerPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Дима Волков' })).toBeTruthy()
    })

    const nameInHero = screen.getByRole('heading', { level: 1, name: 'Дима Волков' })
    expect(nameInHero.style.viewTransitionName).toBe('trainer-name-dima')

    const avatarInHero = document.querySelector('.trainer-avatar--dima') as HTMLElement
    expect(avatarInHero.style.viewTransitionName).toBe('trainer-avatar-dima')
  })

  it('Ordinary navigation: "Другое время" and "Выбрать время" do not morph into Schedule', () => {
    // BookingCard "Другое время"
    render(
      <MemoryRouter>
        <BookingCard booking={mockBooking} />
      </MemoryRouter>
    )

    const otherTimeLink = screen.getByRole('link', { name: /Другое время/i })
    expect(otherTimeLink.getAttribute('href')).toBe('/schedule')

    // TrainerCard "Выбрать время"
    const { container } = render(
      <MemoryRouter>
        <TrainerCard trainer={mockTrainer} />
      </MemoryRouter>
    )

    const chooseTimeBtn = screen.getByRole('link', { name: /Выбрать время тренировки с Дима Волков/i })
    expect(chooseTimeBtn.getAttribute('href')).toBe('/schedule?trainer=dima')
    // Button itself has no viewTransitionName
    expect((chooseTimeBtn as HTMLElement).style.viewTransitionName).toBeFalsy()
    expect(container).toBeDefined()
  })

  it('Bottom nav: indicators slide without page-level view transitions', () => {
    // Route / (index 0)
    const { unmount: unmount1 } = render(
      <MemoryRouter initialEntries={['/']}>
        <MobileBottomNav />
      </MemoryRouter>
    )

    let indicator = document.querySelector('.mobile-nav__indicator') as HTMLElement
    expect(indicator).toBeTruthy()
    expect(indicator.style.transform).toBe('translateX(0%)')
    unmount1()

    // Route /schedule (index 1)
    const { unmount: unmount2 } = render(
      <MemoryRouter initialEntries={['/schedule']}>
        <MobileBottomNav />
      </MemoryRouter>
    )

    indicator = document.querySelector('.mobile-nav__indicator') as HTMLElement
    expect(indicator.style.transform).toBe('translateX(100%)')
    unmount2()

    // Route /trainers (index 2)
    const { unmount: unmount3 } = render(
      <MemoryRouter initialEntries={['/trainers']}>
        <MobileBottomNav />
      </MemoryRouter>
    )

    indicator = document.querySelector('.mobile-nav__indicator') as HTMLElement
    expect(indicator.style.transform).toBe('translateX(200%)')
    unmount3()
  })

  it('Booking mutation decouples query cache commit from 350ms animation hold', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/booking/slot-1']}>
            <Routes>
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    const submitBtn = await screen.findByRole('button', { name: /Подтвердить запись/i })

    // Switch to fine fake timers for checking the 350ms window
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))

    fireEvent.click(submitBtn)

    // Flush promises so mutation onSuccess executes
    await act(async () => {
      await Promise.resolve()
    })

    // Immediately in cache before 350ms timer finishes!
    const cached = queryClient.getQueryData<Booking[]>(['bookings'])
    expect(cached).toBeDefined()
    expect(cached?.some((b) => b.id === 'b-1')).toBe(true)

    // Button holds visual confirmed state
    expect(screen.getByRole('button', { name: /Запись подтверждена/i })).toBeTruthy()

    // Advance 350ms to trigger safeStartViewTransition to details view
    await act(async () => {
      vi.advanceTimersByTime(350)
    })

    // Details view is shown
    expect(screen.getByText('Запись подтверждена')).toBeTruthy()
  })

  it('safeStartViewTransition falls back gracefully when unsupported or under prefers-reduced-motion', () => {
    const callback = vi.fn()

    // 1. When document.startViewTransition is undefined
    const originalSVT = (document as unknown as { startViewTransition?: unknown }).startViewTransition
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition

    safeStartViewTransition(callback)
    expect(callback).toHaveBeenCalledTimes(1)

    // 2. When prefers-reduced-motion is true
    callback.mockClear()
    const mockSVT = vi.fn()
    ;(document as unknown as { startViewTransition: unknown }).startViewTransition = mockSVT

    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList)

    safeStartViewTransition(callback)
    // Must call callback directly WITHOUT calling startViewTransition
    expect(mockSVT).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledTimes(1)

    // Restore
    if (originalSVT) {
      ;(document as unknown as { startViewTransition: unknown }).startViewTransition = originalSVT
    } else {
      delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
    }
  })
})
