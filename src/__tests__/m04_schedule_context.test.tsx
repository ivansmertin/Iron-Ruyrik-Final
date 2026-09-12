import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SchedulePage } from '../pages/SchedulePage'
import { BookingPage } from '../pages/BookingPage'
import { BookingProvider } from '../features/bookings/BookingContext'
import { clearModalStack } from '../services/modalStack'
import * as scheduleApi from '../api/schedule'
import * as trainersApi from '../api/trainers'
import * as bookingsApi from '../api/bookings'
import type { Trainer } from '../types/domain'

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

const mockDays = [
  { id: '2026-09-08', day: 8, weekday: 'ВТ', monthLabel: 'сентября' },
  { id: '2026-09-09', day: 9, weekday: 'СР', monthLabel: 'сентября' },
]

const mockSlots = [
  {
    id: 's-available',
    dateId: '2026-09-08',
    date: '2026-09-08',
    dateLabel: 'Сегодня',
    startAt: '10:00',
    endAt: '11:00',
    startIso: '2026-09-08T10:00:00+03:00',
    endIso: '2026-09-08T11:00:00+03:00',
    capacity: 8,
    occupied: 3, // 5 free -> positive
    isBlocked: false,
  },
  {
    id: 's-one-free',
    dateId: '2026-09-08',
    date: '2026-09-08',
    dateLabel: 'Сегодня',
    startAt: '11:00',
    endAt: '12:00',
    startIso: '2026-09-08T11:00:00+03:00',
    endIso: '2026-09-08T12:00:00+03:00',
    capacity: 8,
    occupied: 7, // 1 free -> warning
    isBlocked: false,
  },
  {
    id: 's-full',
    dateId: '2026-09-08',
    date: '2026-09-08',
    dateLabel: 'Сегодня',
    startAt: '12:00',
    endAt: '13:00',
    startIso: '2026-09-08T12:00:00+03:00',
    endIso: '2026-09-08T13:00:00+03:00',
    capacity: 8,
    occupied: 8, // full
    isBlocked: false,
  },
  {
    id: 's-blocked',
    dateId: '2026-09-08',
    date: '2026-09-08',
    dateLabel: 'Сегодня',
    startAt: '13:00',
    endAt: '14:00',
    startIso: '2026-09-08T13:00:00+03:00',
    endIso: '2026-09-08T14:00:00+03:00',
    capacity: 8,
    occupied: 0,
    isBlocked: true, // blocked
  },
  {
    id: 's-past',
    dateId: '2026-09-08',
    date: '2026-09-08',
    dateLabel: 'Сегодня',
    startAt: '08:00',
    endAt: '09:00',
    startIso: '2026-09-08T08:00:00+03:00',
    endIso: '2026-09-08T09:00:00+03:00', // past if now > 09:00
    capacity: 8,
    occupied: 2,
    isBlocked: false,
  },
]

const mockTrainers: Trainer[] = [
  { id: 'vanya', name: 'Ваня', specialties: ['Силовые'], about: 'Тренер' },
  { id: 'dima', name: 'Дима', specialties: ['Бег'], about: 'Тренер' },
]

describe('Milestone M04: Schedule & Context Round-Trip', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()

    // Freeze time to 2026-09-08 09:30:00 MSK (so s-past at 08:00-09:00 is past, but 10:00+ is future)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T09:30:00+03:00'))

    vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
      days: mockDays,
      slots: mockSlots,
    })
    vi.spyOn(trainersApi, 'getTrainers').mockResolvedValue(mockTrainers)
    vi.spyOn(bookingsApi, 'getBookings').mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders semantic ul/li structure where Link does not have role="listitem"', async () => {
    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/schedule?date=2026-09-08']}>
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Native ul element
    const list = container.querySelector('ul.slot-list')
    expect(list).not.toBeNull()

    // Native li elements
    const listItems = container.querySelectorAll('li.slot-list__item')
    expect(listItems.length).toBe(mockSlots.length)

    // Check available links
    const availableLink = container.querySelector('a#slot-s-available')
    expect(availableLink).not.toBeNull()
    expect(availableLink?.getAttribute('role')).toBeNull() // NO role="listitem" on Link
    expect(availableLink?.getAttribute('href')).toContain('/booking/s-available')
  })

  it('differentiates full, blocked, and past slots using distinct words without interactive links or chevrons', async () => {
    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/schedule?date=2026-09-08']}>
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Full slot
    const fullSlot = container.querySelector('#slot-s-full')
    expect(fullSlot).not.toBeNull()
    expect(fullSlot?.tagName.toLowerCase()).toBe('div')
    expect(fullSlot?.textContent).toContain('Мест нет')
    expect(fullSlot?.querySelector('.time-slot__affordance')).toBeNull()

    // Blocked slot
    const blockedSlot = container.querySelector('#slot-s-blocked')
    expect(blockedSlot).not.toBeNull()
    expect(blockedSlot?.tagName.toLowerCase()).toBe('div')
    expect(blockedSlot?.textContent).toContain('Зал закрыт')
    expect(blockedSlot?.querySelector('.time-slot__affordance')).toBeNull()

    // Past slot
    const pastSlot = container.querySelector('#slot-s-past')
    expect(pastSlot).not.toBeNull()
    expect(pastSlot?.tagName.toLowerCase()).toBe('div')
    expect(pastSlot?.textContent).toContain('Время прошло')
    expect(pastSlot?.querySelector('.time-slot__affordance')).toBeNull()

    // Available slot has affordance arrow
    const availableSlot = container.querySelector('#slot-s-available')
    expect(availableSlot?.querySelector('.time-slot__affordance')).not.toBeNull()
  })

  it('preserves date and trainer params in round-trip from Schedule to Booking and back', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <BookingProvider>
          <MemoryRouter initialEntries={['/schedule?date=2026-09-08&trainer=vanya']}>
            <Routes>
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/booking/:id" element={<BookingPage />} />
            </Routes>
          </MemoryRouter>
        </BookingProvider>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Trainer filter displayed
    expect(screen.getByText(/С тренером Ваня/i)).toBeDefined()

    // Click on available slot
    const slotLink = screen.getByRole('link', { name: /Записаться на время 10:00–11:00/i })
    fireEvent.click(slotLink)

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Booking page should now be active
    const backLink = screen.getByRole('link', { name: /Вернуться к расписанию/i })
    expect(backLink.getAttribute('href')).toContain('date=2026-09-08')
    expect(backLink.getAttribute('href')).toContain('trainer=vanya')

    // Click return link
    fireEvent.click(backLink)

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    // Back in schedule with preserved context
    expect(screen.getByText(/С тренером Ваня/i)).toBeDefined()
  })

  it('restores scroll and focus to source slot when returning with fromSlotId', async () => {
    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/schedule',
              search: '?date=2026-09-08',
              state: { fromSlotId: 's-available' },
            },
          ]}
        >
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const targetEl = container.querySelector('#slot-s-available')
    expect(targetEl).not.toBeNull()
    expect(document.activeElement).toBe(targetEl)
  })

  it('falls back focus to day heading if fromSlotId was removed or does not exist', async () => {
    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/schedule',
              search: '?date=2026-09-08',
              state: { fromSlotId: 'non-existent-slot-id' },
            },
          ]}
        >
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const headingEl = container.querySelector('#schedule-day-heading')
    expect(headingEl).not.toBeNull()
    expect(document.activeElement).toBe(headingEl)
  })

  it('renders cardless open state on empty day without enclosing cards', async () => {
    // Return schedule data with zero slots
    vi.spyOn(scheduleApi, 'getScheduleData').mockResolvedValue({
      days: mockDays,
      slots: [],
    })

    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/schedule?date=2026-09-08']}>
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const emptyState = container.querySelector('.schedule-state--empty')
    expect(emptyState).not.toBeNull()
    expect(screen.getByText('На этот день тренировок нет')).toBeDefined()
  })

  it('restores focus to source slot via sessionStorage fallback on browser Back (R3-03)', async () => {
    window.sessionStorage.setItem('ryrik_schedule_last_slot', 's-available')

    const queryClient = createTestQueryClient()
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/schedule?date=2026-09-08']}>
          <SchedulePage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const slotEl = container.querySelector('#slot-s-available')
    expect(slotEl).not.toBeNull()
    expect(document.activeElement).toBe(slotEl)
  })
})
