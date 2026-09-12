import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrainerPage } from '../pages/TrainerPage'
import * as trainersApi from '../api/trainers'
import * as scheduleApi from '../api/schedule'
import type { TimeSlot, Trainer } from '../types/domain'

vi.mock('../api/trainers')
vi.mock('../api/schedule')

const mockTrainers: Trainer[] = [
  {
    id: 'dima',
    name: 'Дима Волков',
    specialties: ['триатлон', 'бег', 'трейлы', 'выносливость', 'набор мышечной массы / ОФП'],
    about: 'Мастер спорта по пауэрлифтингу и триатлонный тренер.',
  },
  {
    id: 'vanya',
    name: 'Ваня Кузнецов',
    specialties: ['похудение', 'рекомпозиция', 'силовые тренировки'],
    about: 'Сертифицированный тренер по силовой подготовке.',
  },
  {
    id: 'sergey',
    name: 'Сергей Морозов',
    specialties: ['гимнастика', 'растяжка'],
    about: 'Приглашенный специалист по мобильности суставов.',
  },
]

// Slot in the future
const futureSlot: TimeSlot = {
  id: 'slot-future-1',
  dateId: '2026-09-12',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  startAt: '12:00',
  endAt: '13:00',
  startIso: '2026-09-12T12:00:00+03:00',
  endIso: '2026-09-12T13:00:00+03:00',
  capacity: 8,
  occupied: 3,
  isBlocked: false,
}

// Full slot in the future
const fullFutureSlot: TimeSlot = {
  id: 'slot-future-full',
  dateId: '2026-09-12',
  date: '2026-09-12',
  dateLabel: 'Суббота, 12 сентября',
  startAt: '14:00',
  endAt: '15:00',
  startIso: '2026-09-12T14:00:00+03:00',
  endIso: '2026-09-12T15:00:00+03:00',
  capacity: 8,
  occupied: 8,
  isBlocked: false,
}

// Slot in the past (e.g. yesterday)
const pastSlot: TimeSlot = {
  id: 'slot-past-1',
  dateId: '2026-09-10',
  date: '2026-09-10',
  dateLabel: 'Четверг, 10 сентября',
  startAt: '10:00',
  endAt: '11:00',
  startIso: '2026-09-10T10:00:00+03:00',
  endIso: '2026-09-10T11:00:00+03:00',
  capacity: 8,
  occupied: 1,
  isBlocked: false,
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

function renderTrainerPage(initialEntry = '/trainers/dima', client?: QueryClient) {
  const queryClient = client ?? createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/trainers/:id" element={<TrainerPage />} />
          <Route path="/trainers" element={<div>Список всех тренеров</div>} />
          <Route path="/schedule" element={<div>Страница расписания</div>} />
          <Route path="/booking/:slotId" element={<div>Страница бронирования</div>} />
          <Route path="/404" element={<div>Страница 404</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('M07 — Trainer Profile: Editorial Entity & Continuity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-12T08:00:00+03:00'))
    vi.mocked(trainersApi.getTrainers).mockResolvedValue(mockTrainers)
    vi.mocked(scheduleApi.getScheduleData).mockResolvedValue({
      days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
      slots: [futureSlot],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders editorial identity: monogram avatar, full name, and grammatical primary CTA', async () => {
    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Дима Волков' })).toBeTruthy()
    })

    // Monogram avatar
    const initial = screen.getByText('Д')
    expect(initial).toBeTruthy()
    const avatar = initial.closest('.trainer-avatar')
    expect(avatar?.getAttribute('aria-hidden')).toBe('true')

    // Eyebrow
    expect(screen.getByText('ТРЕНЕР')).toBeTruthy()

    // Primary booking action: grammatically clean "Выбрать время", NOT "Записаться к Дима"
    const cta = screen.getByRole('link', { name: /Выбрать время тренировки с Дима Волков/i })
    expect(cta.textContent).toBe('Выбрать время')
    expect(cta.getAttribute('href')).toBe('/schedule?trainer=dima')
    expect(screen.queryByText(/Записаться к/i)).toBeNull()
  })

  it('preserves complete author specialties text without duplicate tags under name', async () => {
    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByText('Дима Волков')).toBeTruthy()
    })

    // Directions heading exists
    expect(screen.getByRole('heading', { level: 2, name: 'Направления' })).toBeTruthy()

    // Preserved author specialty string
    expect(screen.getByText('Набор мышечной массы / ОФП')).toBeTruthy()
    expect(screen.queryByText('Набор массы')).toBeNull()

    // No duplicate tags/chips section
    expect(document.querySelector('.tag-list')).toBeNull()
  })

  it('renders open editorial About section without enclosing card panel', async () => {
    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'О тренере' })).toBeTruthy()
    })

    expect(screen.getByText('Мастер спорта по пауэрлифтингу и триатлонный тренер.')).toBeTruthy()
  })

  it('renders Telegram channel only for Dima as open editorial block with external link', async () => {
    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByText('Говер на движениях')).toBeTruthy()
    })

    const tgLink = screen.getByRole('link', { name: /Telegram-канал Говер на движениях/i })
    expect(tgLink.getAttribute('href')).toBe('https://t.me/goverrun')
    expect(tgLink.getAttribute('target')).toBe('_blank')
    expect(tgLink.getAttribute('rel')).toBe('noopener noreferrer')

    // Channel card must not have legacy icon box
    expect(document.querySelector('.trainer-channel-card__icon')).toBeNull()
  })

  it('does not render Telegram channel for trainers without a channel (e.g. Vanya)', async () => {
    renderTrainerPage('/trainers/vanya')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Ваня Кузнецов' })).toBeTruthy()
    })

    expect(screen.queryByText('Говер на движениях')).toBeNull()
    expect(screen.queryByText('Telegram-канал')).toBeNull()
  })

  it('selects future available slot for "Ближайшее время в зале" and excludes past slots', async () => {
    // Schedule with a past available slot and a future available slot
    vi.mocked(scheduleApi.getScheduleData).mockResolvedValue({
      days: [
        { id: '2026-09-10', day: 10, weekday: 'ЧТ', monthLabel: 'сентября' },
        { id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' },
      ],
      slots: [pastSlot, futureSlot],
    })

    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByText(/Ближайшее время в зале/i)).toBeTruthy()
    })

    // Future slot must be chosen, NOT the past slot
    expect(screen.getByText(/Суббота, 12 сентября, 12:00–13:00/i)).toBeTruthy()
    expect(screen.queryByText(/Четверг, 10 сентября/i)).toBeNull()

    // Action button leads to booking for this slot with trainer preselected
    const bookBtn = screen.getByRole('link', { name: /Выбрать слот 12:00/i })
    expect(bookBtn.getAttribute('href')).toBe('/booking/slot-future-1?trainer=dima')
  })

  it('shows honest empty message and link to schedule when no future slots have capacity', async () => {
    // Schedule with only past slots and full future slots
    vi.mocked(scheduleApi.getScheduleData).mockResolvedValue({
      days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
      slots: [pastSlot, fullFutureSlot],
    })

    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByText('На ближайшие дни свободных мест нет')).toBeTruthy()
    })

    const allSlotsBtn = screen.getByRole('link', { name: 'Смотреть всё расписание' })
    expect(allSlotsBtn.getAttribute('href')).toBe('/schedule')
  })

  it('handles schedule query error gracefully without breaking trainer profile', async () => {
    vi.mocked(scheduleApi.getScheduleData).mockRejectedValue(new Error('Schedule offline'))

    renderTrainerPage('/trainers/dima')

    // Trainer identity still loads
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Дима Волков' })).toBeTruthy()
    })

    // Schedule error shown in next slot section
    expect(screen.getByText('Не удалось загрузить ближайшие слоты')).toBeTruthy()
    const scheduleLink = screen.getByRole('link', { name: 'Открыть расписание' })
    expect(scheduleLink.getAttribute('href')).toBe('/schedule')
  })

  it('distinguishes trainers query error with retry button from unknown trainer (does not redirect to 404)', async () => {
    vi.mocked(trainersApi.getTrainers).mockRejectedValue(new Error('Network error'))

    renderTrainerPage('/trainers/dima')

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })

    expect(
      screen.getByText('Не удалось загрузить профиль тренера. Проверьте соединение и повторите попытку.')
    ).toBeTruthy()

    // Retry button exists
    const retryBtn = screen.getByRole('button', { name: /Повторить попытку/i })
    expect(retryBtn).toBeTruthy()

    // Not redirected to 404
    expect(screen.queryByText('Страница 404')).toBeNull()

    // Clicking retry triggers query refetch
    vi.mocked(trainersApi.getTrainers).mockResolvedValue(mockTrainers)
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.getByText('Дима Волков')).toBeTruthy()
    })
  })

  it('renders in-page not found message when trainer id is genuinely unknown (does not redirect to 404)', async () => {
    renderTrainerPage('/trainers/unknown-trainer')

    await waitFor(() => {
      expect(screen.getByRole('status')).toBeTruthy()
    })

    expect(screen.getByText(/Тренер не найден/i)).toBeTruthy()
    const backBtn = screen.getByRole('link', { name: 'Вернуться к списку тренеров' })
    expect(backBtn.getAttribute('href')).toBe('/trainers')

    // Not redirected to 404
    expect(screen.queryByText('Страница 404')).toBeNull()
  })

  it('renders read-only profile for trainer outside booking contract without silent fallback to self', async () => {
    renderTrainerPage('/trainers/sergey')

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Сергей Морозов' })).toBeTruthy()
    })

    // Full profile renders
    expect(screen.getByText('Приглашенный специалист по мобильности суставов.')).toBeTruthy()
    expect(screen.getByText('Гимнастика')).toBeTruthy()

    // Booking CTA is disabled with honest informational notice
    expect(
      screen.getByText('Запись к этому тренеру через приложение временно недоступна.')
    ).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Выбрать время тренировки с Сергей Морозов/i })).toBeNull()

    // Next slot button navigates to general schedule without preselecting unsupported trainer
    const nextSlotBtn = screen.getByRole('link', { name: 'Открыть общее расписание' })
    expect(nextSlotBtn.getAttribute('href')).toBe('/schedule')
  })

  it('renders accessible skeleton during initial loading', () => {
    vi.mocked(trainersApi.getTrainers).mockReturnValue(new Promise(() => {}))

    renderTrainerPage('/trainers/dima')

    const loadingEl = screen.getByLabelText('Загрузка профиля тренера')
    expect(loadingEl).toBeTruthy()
    expect(loadingEl.getAttribute('aria-busy')).toBe('true')
  })
})
