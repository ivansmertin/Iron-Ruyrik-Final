import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TrainerCard } from '../components/TrainerCard'
import { TrainersPage } from '../pages/TrainersPage'
import * as trainersApi from '../api/trainers'
import type { Trainer } from '../types/domain'

vi.mock('../api/trainers')

const mockTrainers: Trainer[] = [
  {
    id: 'dima',
    name: 'Дмитрий Волков',
    specialties: [
      'силовые тренировки',
      'пауэрлифтинг',
      'набор мышечной массы / ОФП',
      'реабилитация после травм',
      'составление рациона',
    ],
    about: 'Мастер спорта по пауэрлифтингу.',
  },
  {
    id: 'vanya',
    name: 'Иван Кузнецов',
    specialties: ['функциональный тренинг', 'похудение', 'растяжка'],
    about: 'Сертифицированный тренер по кроссфиту.',
  },
]

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
}

describe('M06 — Trainers Editorial Entity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('TrainerCard Component', () => {
    it('renders editorial entity with monogram avatar and full name', () => {
      const trainer = mockTrainers[0]
      render(
        <MemoryRouter>
          <TrainerCard trainer={trainer} />
        </MemoryRouter>
      )

      // Article container
      const article = screen.getByRole('article', { name: `Тренер ${trainer.name}` })
      expect(article).toBeTruthy()

      // Monogram avatar
      const initial = screen.getByText('Д')
      expect(initial).toBeTruthy()
      const avatar = initial.closest('.trainer-avatar')
      expect(avatar?.getAttribute('aria-hidden')).toBe('true')

      // Full name heading
      const heading = screen.getByRole('heading', { level: 2, name: trainer.name })
      expect(heading).toBeTruthy()
      expect(heading.textContent).toBe(trainer.name)
    })

    it('renders sibling actions without nesting interactive elements', () => {
      const trainer = mockTrainers[0]
      render(
        <MemoryRouter>
          <TrainerCard trainer={trainer} />
        </MemoryRouter>
      )

      // Identity link navigating to trainer profile
      const profileLink = screen.getByRole('link', {
        name: `Профиль тренера ${trainer.name}`,
      })
      expect(profileLink.getAttribute('href')).toBe(`/trainers/${trainer.id}`)

      // Booking action button link navigating to schedule with trainer filter
      const bookingLink = screen.getByRole('link', {
        name: `Выбрать время тренировки с ${trainer.name}`,
      })
      expect(bookingLink.getAttribute('href')).toBe(`/schedule?trainer=${trainer.id}`)

      // Crucial: profileLink must not contain bookingLink, and bookingLink must not contain profileLink
      expect(profileLink.contains(bookingLink)).toBe(false)
      expect(bookingLink.contains(profileLink)).toBe(false)
    })

    it('preserves complete author specialty text without destructive truncation', () => {
      const trainer = mockTrainers[0]
      render(
        <MemoryRouter>
          <TrainerCard trainer={trainer} />
        </MemoryRouter>
      )

      // "набор мышечной массы / ОФП" must NOT be shrunken to "Набор массы"
      expect(screen.getByText('Набор мышечной массы / ОФП')).toBeTruthy()
      expect(screen.queryByText('Набор массы')).toBeNull()
    })

    it('handles disclosure for > 3 specialties with aria-expanded and aria-controls', () => {
      const trainer = mockTrainers[0] // 5 specialties
      render(
        <MemoryRouter>
          <TrainerCard trainer={trainer} />
        </MemoryRouter>
      )

      const specListId = `trainer-specs-${trainer.id}`
      const specList = screen.getByRole('list', { name: `Направления: ${trainer.name}` })
      expect(specList.getAttribute('id')).toBe(specListId)

      // First 3 visible initially
      expect(screen.getByText('Силовые тренировки')).toBeTruthy()
      expect(screen.getByText('Пауэрлифтинг')).toBeTruthy()
      expect(screen.getByText('Набор мышечной массы / ОФП')).toBeTruthy()

      // 4th and 5th hidden initially
      expect(screen.queryByText('Реабилитация после травм')).toBeNull()
      expect(screen.queryByText('Составление рациона')).toBeNull()

      // Disclosure button
      const disclosureBtn = screen.getByRole('button', { name: 'Все направления (5)' })
      expect(disclosureBtn.getAttribute('aria-expanded')).toBe('false')
      expect(disclosureBtn.getAttribute('aria-controls')).toBe(specListId)

      // Click to expand
      fireEvent.click(disclosureBtn)

      // Now all 5 are visible
      expect(screen.getByText('Реабилитация после травм')).toBeTruthy()
      expect(screen.getByText('Составление рациона')).toBeTruthy()
      expect(disclosureBtn.getAttribute('aria-expanded')).toBe('true')
      expect(screen.getByText('Свернуть')).toBeTruthy()

      // Click to collapse
      fireEvent.click(disclosureBtn)
      expect(screen.queryByText('Реабилитация после травм')).toBeNull()
      expect(disclosureBtn.getAttribute('aria-expanded')).toBe('false')
      expect(screen.getByText('Все направления (5)')).toBeTruthy()
    })

    it('does not render disclosure button when specialties <= 3', () => {
      const trainer = mockTrainers[1] // 3 specialties
      render(
        <MemoryRouter>
          <TrainerCard trainer={trainer} />
        </MemoryRouter>
      )

      expect(screen.getByText('Функциональный тренинг')).toBeTruthy()
      expect(screen.getByText('Похудение')).toBeTruthy()
      expect(screen.getByText('Растяжка')).toBeTruthy()

      // Disclosure button should not be present
      expect(screen.queryByRole('button', { name: /Все направления/ })).toBeNull()
    })

    it('renders long complex Russian names without truncation', () => {
      const longNameTrainer: Trainer = {
        id: 'dima',
        name: 'Константин Константинопольский-Преображенский',
        specialties: ['ОФП'],
        about: '',
      }

      render(
        <MemoryRouter>
          <TrainerCard trainer={longNameTrainer} />
        </MemoryRouter>
      )

      const heading = screen.getByRole('heading', {
        level: 2,
        name: 'Константин Константинопольский-Преображенский',
      })
      expect(heading).toBeTruthy()
      expect(screen.getByText('К')).toBeTruthy()
    })
  })

  describe('TrainersPage Component', () => {
    it('renders loading skeleton with aria-busy while loading', () => {
      vi.mocked(trainersApi.getTrainers).mockReturnValue(new Promise(() => {}))

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TrainersPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      const loadingContainer = screen.getByLabelText('Загрузка списка тренеров')
      expect(loadingContainer).toBeTruthy()
      expect(loadingContainer.getAttribute('aria-busy')).toBe('true')
    })

    it('renders error state with retry button and keeps self-training row accessible', async () => {
      vi.mocked(trainersApi.getTrainers).mockRejectedValue(new Error('Network error'))

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TrainersPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy()
      })

      expect(
        screen.getByText(/Не удалось загрузить список тренеров. Проверьте соединение/i)
      ).toBeTruthy()

      const retryBtn = screen.getByRole('button', { name: /Повторить попытку/i })
      expect(retryBtn).toBeTruthy()

      // Self-training row is still visible
      expect(
        screen.getByRole('region', { name: 'Самостоятельная тренировка' })
      ).toBeTruthy()
      expect(
        screen.getByRole('link', { name: 'Выбрать время для самостоятельной тренировки' }).getAttribute('href')
      ).toBe('/schedule')

      // Clicking retry triggers refetch
      vi.mocked(trainersApi.getTrainers).mockResolvedValue(mockTrainers)
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(screen.getByText('Дмитрий Волков')).toBeTruthy()
      })
    })

    it('renders empty state when trainers list is empty', async () => {
      vi.mocked(trainersApi.getTrainers).mockResolvedValue([])

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TrainersPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByRole('status')).toBeTruthy()
      })

      expect(
        screen.getByText(/В данный момент список тренеров обновляется/i)
      ).toBeTruthy()

      // Self-training row is still visible
      expect(
        screen.getByRole('region', { name: 'Самостоятельная тренировка' })
      ).toBeTruthy()
    })

    it('renders populated trainers list and self-training footer row', async () => {
      vi.mocked(trainersApi.getTrainers).mockResolvedValue(mockTrainers)

      const queryClient = createTestQueryClient()
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <TrainersPage />
          </MemoryRouter>
        </QueryClientProvider>
      )

      await waitFor(() => {
        expect(screen.getByText('Дмитрий Волков')).toBeTruthy()
      })

      expect(screen.getByText('Иван Кузнецов')).toBeTruthy()

      // Sibling action buttons exist
      const scheduleLinks = screen.getAllByRole('link', { name: /Выбрать время тренировки/i })
      expect(scheduleLinks.length).toBe(2)

      // Self-training footer row
      const selfTrainingLink = screen.getByRole('link', {
        name: 'Выбрать время для самостоятельной тренировки',
      })
      expect(selfTrainingLink.getAttribute('href')).toBe('/schedule')
    })
  })
})
