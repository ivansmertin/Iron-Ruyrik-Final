import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomePage } from '../pages/HomePage'
import { BookingCard } from '../components/BookingCard'
import { CapacityIndicator } from '../components/CapacityIndicator'
import { GymNewsWidget } from '../components/GymNewsWidget'
import { clearModalStack, getModalStackDepth } from '../services/modalStack'
import type { Booking, TimeSlot } from '../types/domain'

// Mock Home Page API dependencies
vi.mock('../api/home', () => ({
  getHomeData: vi.fn().mockResolvedValue({
    user: { id: 'u-1', name: 'Алексей', city: 'Великий Новгород' },
    activeBooking: null,
    capacity: { occupied: 0, limit: 8 },
  }),
}))

vi.mock('../api/schedule', () => ({
  getScheduleData: vi.fn().mockResolvedValue({
    days: [{ id: '2026-09-08', day: 8, weekday: 'ВТ', monthLabel: 'сентября' }],
    slots: [
      {
        id: 's-1',
        dateId: '2026-09-08',
        date: '2026-09-08',
        dateLabel: 'Сегодня',
        startAt: '17:30',
        endAt: '18:30',
        startIso: '2026-09-08T17:30:00+03:00',
        endIso: '2026-09-08T18:30:00+03:00',
        capacity: 8,
        occupied: 0,
        isBlocked: false,
      },
    ],
  }),
}))

vi.mock('../api/news', () => ({
  getGymNews: vi.fn().mockResolvedValue({
    channelUrl: 'https://t.me/goverrun',
    channelHandle: '@goverrun',
    posts: [
      {
        id: 101,
        date: '2026-09-04T12:00:00Z',
        text: 'Здарова, народ! Через три часа начинаем вечернюю тренировку.',
        imageUrl: 'https://example.com/photo.jpg',
        views: '1.2K',
        url: 'https://t.me/goverrun/101',
      },
    ],
  }),
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

describe('Home Page Cardless / Container-Light Milestone', () => {
  beforeEach(() => {
    clearModalStack()
    vi.restoreAllMocks()
  })

  describe('1. Header & Location Control', () => {
    it('renders greeting and borderless location button with >= 44px touch target', async () => {
      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <HomePage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Greeting
      expect(await screen.findByText('ДОБРЫЙ ДЕНЬ')).toBeDefined()
      expect(screen.getByRole('heading', { level: 1, name: 'Алексей' })).toBeDefined()

      // Location button (borderless interactive control)
      const locBtn = screen.getByRole('button', { name: /Великий Новгород/i })
      expect(locBtn).toBeDefined()
      expect(locBtn.className).toContain('home-location-btn')

      // Clicking opens club details modal
      fireEvent.click(locBtn)
      expect(getModalStackDepth()).toBe(1)
      expect(screen.getByRole('heading', { level: 2, name: 'Железный Рюрик' })).toBeDefined()
      expect(screen.getByText(/ул. Большая Санкт-Петербургская, 28/i)).toBeDefined()
    })
  })

  describe('2. Hero Workout: 4 Business States', () => {
    const mockAvailableSlot: TimeSlot = {
      id: 's-1',
      dateId: '2026-09-08',
      date: '2026-09-08',
      dateLabel: 'Сегодня',
      startAt: '17:30',
      endAt: '18:30',
      startIso: '2026-09-08T17:30:00+03:00',
      endIso: '2026-09-08T18:30:00+03:00',
      capacity: 8,
      occupied: 0,
      isBlocked: false,
    }

    const mockFullSlot: TimeSlot = {
      ...mockAvailableSlot,
      occupied: 8,
    }

    const mockActiveBooking: Booking = {
      id: 'b-1',
      slotId: 's-1',
      userId: 'u-1',
      clientName: 'Алексей',
      title: 'Силовая тренировка',
      startAt: '17:30',
      endAt: '18:30',
      date: '2026-09-08',
      dateLabel: 'Сегодня',
      trainerName: 'Ваня',
      trainerId: 'vanya',
      status: 'confirmed',
      createdAt: '2026-09-07T10:00:00Z',
      cancelledAt: null,
    }

    it('State A: Available slot renders hero time, title, capacity hint, and primary CTA [Записаться]', () => {
      render(
        <MemoryRouter>
          <BookingCard booking={null} nextSlot={mockAvailableSlot} />
        </MemoryRouter>
      )

      expect(screen.getByText(/8 сентября/i)).toBeDefined()
      expect(screen.getByText('17:30–18:30')).toBeDefined()
      expect(screen.getByText('Силовая тренировка')).toBeDefined()
      expect(screen.getByText('Ваня · 60 мин')).toBeDefined()
      expect(screen.getByText('8 мест на тренировку')).toBeDefined()

      const cta = screen.getByRole('link', { name: 'Записаться' })
      expect(cta).toBeDefined()
      expect(cta.getAttribute('href')).toBe('/booking/s-1')

      const secondaryLink = screen.getByRole('link', { name: /Другое время/i })
      expect(secondaryLink).toBeDefined()
      expect(secondaryLink.getAttribute('href')).toBe('/schedule')
    })

    it('State B: Booked workout renders confirmed status, details link, and NEVER shows [Записаться]', () => {
      render(
        <MemoryRouter>
          <BookingCard booking={mockActiveBooking} nextSlot={mockAvailableSlot} />
        </MemoryRouter>
      )

      expect(screen.getByText(/ЗАПИСЬ ПОДТВЕРЖДЕНА/i)).toBeDefined()
      expect(screen.getByText('17:30–18:30')).toBeDefined()
      expect(screen.getByText('Силовая тренировка')).toBeDefined()

      // Primary CTA is [Подробнее], linking to booking details
      const cta = screen.getByRole('link', { name: 'Подробнее' })
      expect(cta).toBeDefined()
      expect(cta.getAttribute('href')).toBe('/booking/b-1')

      // Must NOT show 'Записаться'
      expect(screen.queryByRole('link', { name: 'Записаться' })).toBeNull()

      const secondaryLink = screen.getByRole('link', { name: /Другое время/i })
      expect(secondaryLink).toBeDefined()
      expect(secondaryLink.getAttribute('href')).toBe('/schedule')
    })

    it('State C: No upcoming workout renders clean empty state and [Найти время]', () => {
      render(
        <MemoryRouter>
          <BookingCard booking={null} nextSlot={null} />
        </MemoryRouter>
      )

      expect(screen.getByText('БЛИЖАЙШАЯ ТРЕНИРОВКА')).toBeDefined()
      expect(screen.getByText('Пока ничего не выбрано')).toBeDefined()
      const cta = screen.getByRole('link', { name: 'Найти время' })
      expect(cta).toBeDefined()
      expect(cta.getAttribute('href')).toBe('/schedule')
    })

    it('State D: Slot full renders muted time, Мест нет, and [Другое время]', () => {
      render(
        <MemoryRouter>
          <BookingCard booking={null} nextSlot={mockFullSlot} />
        </MemoryRouter>
      )

      expect(screen.getByText('Мест нет')).toBeDefined()
      expect(screen.getByText('17:30–18:30')).toBeDefined()
      expect(screen.getByText(/На этот интервал все места заняты/i)).toBeDefined()

      const action = screen.getByRole('link', { name: 'Другое время' })
      expect(action).toBeDefined()
      expect(action.getAttribute('href')).toBe('/schedule')
    })
  })

  describe('3. Gym Capacity: Cardless & Non-Redundant', () => {
    it('renders big athletic metric and single clean note without redundant status pills', () => {
      const { rerender } = render(<CapacityIndicator occupied={0} limit={8} />)

      expect(screen.getByText('СЕЙЧАС В ЗАЛЕ')).toBeDefined()
      expect(screen.getByText('0')).toBeDefined()
      expect(screen.getByText('8')).toBeDefined()
      expect(screen.getByText('Все 8 мест свободны')).toBeDefined()

      // When 4 occupied
      rerender(<CapacityIndicator occupied={4} limit={8} />)
      expect(screen.getByText('4')).toBeDefined()
      expect(screen.getByText('Осталось 4 места')).toBeDefined()

      // When 7 occupied
      rerender(<CapacityIndicator occupied={7} limit={8} />)
      expect(screen.getByText('7')).toBeDefined()
      expect(screen.getByText('Осталось 1 место')).toBeDefined()

      // When full (8 occupied)
      rerender(<CapacityIndicator occupied={8} limit={8} />)
      expect(screen.getAllByText('8').length).toBe(2)
      expect(screen.getByText(/Все места заняты/i)).toBeDefined()
    })
  })

  describe('4. Gym News: Editorial Content Feed', () => {
    it('renders editorial feed with author, media preview, and distinct @goverrun / post action', async () => {
      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <GymNewsWidget />
        </QueryClientProvider>
      )

      expect(await screen.findByText('Дмитрий Говер')).toBeDefined()
      expect(screen.getByText('НОВОСТИ ЗАЛА')).toBeDefined()
      expect(screen.getByText(/Основатель и тренер/i)).toBeDefined()
      expect(screen.getByText(/Здарова, народ!/i)).toBeDefined()

      // Compact channel link in header
      const channelLink = screen.getByRole('link', { name: /@goverrun/i })
      expect(channelLink).toBeDefined()
      expect(channelLink.getAttribute('href')).toBe('https://t.me/goverrun')

      // Differentiated post link in footer
      const postLink = screen.getByRole('link', { name: /Открыть публикацию в Telegram/i })
      expect(postLink).toBeDefined()
      expect(screen.getByText('К публикации')).toBeDefined()
      expect(postLink.getAttribute('href')).toBe('https://t.me/goverrun/101')
    })

    it('handles long text with expand toggle, absence of image, and no duplicate footer link when url is channel', async () => {
      const { getGymNews } = await import('../api/news')
      vi.mocked(getGymNews).mockResolvedValueOnce({
        channelTitle: 'Железный Рюрик',
        channelHandle: '@goverrun',
        channelUrl: 'https://t.me/goverrun',
        authorName: 'Дмитрий Говер',
        authorRole: 'Основатель и тренер',
        posts: [
          {
            id: '102',
            postNumber: 102,
            date: '2026-09-04T12:00:00Z',
            text: 'A'.repeat(250), // Long text > 170 chars
            imageUrl: null, // Absence of image
            views: '800',
            url: 'https://t.me/goverrun', // Same as channelUrl -> no duplicate link
          },
        ],
      })

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <GymNewsWidget />
        </QueryClientProvider>
      )

      expect(await screen.findByText('Дмитрий Говер')).toBeDefined()
      // Image should not be rendered
      expect(screen.queryByRole('img')).toBeNull()

      // Expand button present
      const expandBtn = screen.getByRole('button', { name: 'Читать дальше' })
      expect(expandBtn).toBeDefined()
      fireEvent.click(expandBtn)
      expect(screen.getByRole('button', { name: 'Свернуть' })).toBeDefined()

      // When url is same as channelUrl, footer does not duplicate link
      expect(screen.queryByText('К публикации')).toBeNull()
      expect(screen.queryByRole('link', { name: /Открыть публикацию/i })).toBeNull()
    })
  })
})

