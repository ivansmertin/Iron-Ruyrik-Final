import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BookingCard } from '../components/BookingCard'
import { HomePage } from '../pages/HomePage'
import { GymNewsWidget } from '../components/GymNewsWidget'
import * as homeApi from '../api/home'
import * as scheduleApi from '../api/schedule'
import * as newsApi from '../api/news'
import type { Booking, NewsResponse, TimeSlot } from '../types/domain'

vi.mock('../api/home')
vi.mock('../api/schedule')
vi.mock('../api/news')

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe('M03: Home Polish & Data Honesty', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('1. Schedule Error Isolation vs Active Booking', () => {
    it('shows schedule error state with retry when no booking and schedule fails', () => {
      const onRetry = vi.fn()
      render(
        <MemoryRouter>
          <BookingCard
            booking={null}
            nextSlot={null}
            isScheduleError={true}
            onRetrySchedule={onRetry}
          />
        </MemoryRouter>
      )

      expect(screen.getByText('Не удалось загрузить расписание')).toBeDefined()
      expect(screen.getByText(/Проверьте соединение с интернетом/i)).toBeDefined()
      expect(screen.queryByText('Пока ничего не выбрано')).toBeNull()

      const retryBtn = screen.getByRole('button', { name: 'Повторить' })
      expect(retryBtn).toBeDefined()
      fireEvent.click(retryBtn)
      expect(onRetry).toHaveBeenCalledTimes(1)
    })

    it('displays active booking even if schedule query fails', () => {
      const mockBooking: Booking = {
        id: 'b-active',
        slotId: 's-active',
        userId: 'u-1',
        clientName: 'Алексей',
        title: 'Персональная с тренером',
        startAt: '10:00',
        endAt: '11:15',
        date: '2026-09-12',
        dateLabel: 'Завтра',
        trainerName: 'Михаил',
        trainerId: 'vanya',
        status: 'confirmed',
        createdAt: '2026-09-11T10:00:00Z',
        cancelledAt: null,
      }

      render(
        <MemoryRouter>
          <BookingCard
            booking={mockBooking}
            nextSlot={null}
            isScheduleError={true}
          />
        </MemoryRouter>
      )

      expect(screen.getByText('Персональная с тренером')).toBeDefined()
      expect(screen.getByText('Михаил · 75 мин')).toBeDefined()
      expect(screen.queryByText('Не удалось загрузить расписание')).toBeNull()
    })
  })

  describe('2. Dynamic Duration Calculation & Neutral Slot Copy', () => {
    it('calculates non-standard duration correctly (e.g. 90 minutes) for unbooked slot', () => {
      const slot90Min: TimeSlot = {
        id: 's-90',
        dateId: '2026-09-15',
        date: '2026-09-15',
        dateLabel: 'Вторник',
        startAt: '09:00',
        endAt: '10:30',
        startIso: '2026-09-15T09:00:00+03:00',
        endIso: '2026-09-15T10:30:00+03:00',
        capacity: 8,
        occupied: 2,
        isBlocked: false,
      }

      render(
        <MemoryRouter>
          <BookingCard booking={null} nextSlot={slot90Min} />
        </MemoryRouter>
      )

      expect(screen.getByText('Тренировка в зале')).toBeDefined()
      expect(screen.getByText('90 мин · Тренер или самостоятельно')).toBeDefined()
      expect(screen.queryByText('Ваня · 60 мин')).toBeNull()
    })

    it('calculates duration for full slot and shows neutral title', () => {
      const slotFull: TimeSlot = {
        id: 's-full',
        dateId: '2026-09-15',
        date: '2026-09-15',
        dateLabel: 'Вторник',
        startAt: '18:00',
        endAt: '19:30',
        startIso: '2026-09-15T18:00:00+03:00',
        endIso: '2026-09-15T19:30:00+03:00',
        capacity: 8,
        occupied: 8,
        isBlocked: false,
      }

      render(
        <MemoryRouter>
          <BookingCard booking={null} nextSlot={slotFull} />
        </MemoryRouter>
      )

      expect(screen.getByText('Тренировка в зале')).toBeDefined()
      expect(screen.getByText('90 мин')).toBeDefined()
      expect(screen.getByText('Мест нет')).toBeDefined()
      expect(screen.queryByText('Силовая тренировка')).toBeNull()
    })
  })

  describe('3. HomePage Past Slot Exclusion & Dynamic Capacity Rule', () => {
    it('does NOT fallback to past slots when all slots in schedule are in the past', async () => {
      vi.mocked(homeApi.getHomeData).mockResolvedValue({
        user: { id: 'u-1', name: 'Сергей', city: 'Великий Новгород' },
        membership: {
          id: 'm-1',
          type: 'subscription',
          title: '12 занятий',
          totalVisits: 12,
          visitsLeft: 10,
        },
        activeBooking: null,
        capacity: { occupied: 3, limit: 10 },
      })

      // Slot is strictly in the past (e.g. 2020)
      vi.mocked(scheduleApi.getScheduleData).mockResolvedValue({
        days: [{ id: '2020-01-01', day: 1, weekday: 'СР', monthLabel: 'января' }],
        slots: [
          {
            id: 's-past',
            dateId: '2020-01-01',
            date: '2020-01-01',
            dateLabel: 'Давно',
            startAt: '10:00',
            endAt: '11:00',
            startIso: '2020-01-01T10:00:00+03:00',
            endIso: '2020-01-01T11:00:00+03:00',
            capacity: 8,
            occupied: 1,
            isBlocked: false,
          },
        ],
      })

      vi.mocked(newsApi.getGymNews).mockResolvedValue({
        channelTitle: 'Железный Рюрик',
        authorName: 'Дмитрий Говер',
        authorRole: 'Основатель и тренер',
        channelUrl: 'https://t.me/goverrun',
        channelHandle: '@goverrun',
        posts: [],
      })

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <HomePage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      // Should show honest empty state because the slot is in the past!
      expect(await screen.findByText('Пока ничего не выбрано')).toBeDefined()
      expect(screen.getByText('Найти время')).toBeDefined()
      expect(screen.queryByText('10:00–11:00')).toBeNull()

      // Club modal has dynamic limit (10, not hardcoded 8)
      const locBtn = screen.getByRole('button', { name: /Великий Новгород/i })
      fireEvent.click(locBtn)
      expect(screen.getByText(/не более 10 человек/i)).toBeDefined()
    })
  })

  describe('4. GymNewsWidget Robustness', () => {
    it('clamps activeIndex when posts count shrinks and does not crash', async () => {
      let resolveNews: (val: NewsResponse) => void
      const newsPromise = new Promise<NewsResponse>((res) => {
        resolveNews = res
      })

      vi.mocked(newsApi.getGymNews).mockReturnValue(newsPromise)

      const queryClient = createTestQueryClient()
      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <GymNewsWidget />
        </QueryClientProvider>
      )

      // Initial data: 3 posts
      resolveNews!({
        channelTitle: 'Железный Рюрик',
        authorName: 'Дмитрий Говер',
        authorRole: 'Основатель и тренер',
        channelUrl: 'https://t.me/goverrun',
        channelHandle: '@goverrun',
        posts: [
          { id: '1', postNumber: 1, date: '2026-09-01T10:00:00Z', text: 'Пост 1', imageUrl: null, url: 'https://t.me/goverrun/1', views: '1K' },
          { id: '2', postNumber: 2, date: '2026-09-02T10:00:00Z', text: 'Пост 2', imageUrl: null, url: 'https://t.me/goverrun/2', views: '1.2K' },
          { id: '3', postNumber: 3, date: '2026-09-03T10:00:00Z', text: 'Пост 3', imageUrl: null, url: 'https://t.me/goverrun/3', views: '1.5K' },
        ],
      })

      expect(await screen.findByText('Пост 1')).toBeDefined()

      // Navigate to post 3 (index 2)
      const nextBtn = screen.getByRole('button', { name: 'Следующая новость' })
      fireEvent.click(nextBtn)
      expect(screen.getByText('Пост 2')).toBeDefined()
      fireEvent.click(nextBtn)
      expect(screen.getByText('Пост 3')).toBeDefined()

      // Now query refetches with only 1 post
      queryClient.setQueryData(['gymNews'], {
        channelTitle: 'Железный Рюрик',
        authorName: 'Дмитрий Говер',
        authorRole: 'Основатель и тренер',
        channelUrl: 'https://t.me/goverrun',
        channelHandle: '@goverrun',
        posts: [
          { id: '99', postNumber: 99, date: '2026-09-10T10:00:00Z', text: 'Единственный пост', imageUrl: null, url: 'https://t.me/goverrun/99', views: '2K' },
        ],
      })

      rerender(
        <QueryClientProvider client={queryClient}>
          <GymNewsWidget />
        </QueryClientProvider>
      )

      // Clamped to index 0, renders single post without error
      await waitFor(() => {
        expect(screen.getByText('Единственный пост')).toBeDefined()
      })
    })

    it('distinguishes network error from empty posts fallback', async () => {
      vi.mocked(newsApi.getGymNews).mockRejectedValueOnce(new Error('Network error'))

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <GymNewsWidget />
        </QueryClientProvider>
      )

      expect(await screen.findByText(/Не удалось загрузить новости/i)).toBeDefined()
    })
  })
})
