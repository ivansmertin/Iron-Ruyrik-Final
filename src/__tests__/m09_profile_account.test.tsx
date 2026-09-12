import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProfileData } from '../api/profile'
import { MembershipCard } from '../components/MembershipCard'
import { ProfilePage } from '../pages/ProfilePage'
import type { Membership, VisitHistoryItem } from '../types/domain'

vi.mock('../api/profile', () => ({
  getProfileData: vi.fn(),
}))

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  })
}

function renderWithClient(ui: ReactNode) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

const mockStandardProfile = {
  user: {
    id: 'user_1',
    name: 'Алексей Смирнов',
    city: 'Великий Новгород',
    role: 'client' as const,
    isActive: true,
  },
  membership: {
    id: 'mem_1',
    type: 'visits_package' as const,
    title: 'Абонемент на 8 занятий',
    totalVisits: 8,
    visitsLeft: 5,
    expiresAt: '2026-10-15T00:00:00+03:00',
    status: 'active',
  },
  history: [
    {
      id: 'b1',
      dateLabel: '8 сентября',
      time: '10:00–11:00',
      trainerId: 'dima' as const,
      trainerName: 'Дима',
    },
    {
      id: 'b2',
      dateLabel: '5 сентября',
      time: '18:00–19:00',
      trainerId: 'vanya' as const,
      trainerName: 'Ваня',
    },
    {
      id: 'b3',
      dateLabel: '1 сентября',
      time: '12:00–13:00',
      trainerId: null,
      trainerName: null,
    },
  ] as VisitHistoryItem[],
}

describe('M09 — Profile: Identity, Membership & Honest Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('1. Identity & Layout', () => {
    it('renders user identity with avatar, large name, and city', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Алексей Смирнов')).toBeDefined()
      })

      expect(screen.getByText('СПОРТСМЕН')).toBeDefined()
      const identitySection = screen.getByLabelText(/Профиль: Алексей Смирнов/)
      expect(identitySection).toBeDefined()
      expect(identitySection.textContent).toContain('Великий Новгород')
      expect(identitySection.classList.contains('profile-identity-section')).toBe(true)
    })

    it('handles long names without breaking layout', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        user: {
          ...mockStandardProfile.user,
          name: 'Константинопольский Константин Константинович',
        },
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Константинопольский Константин Константинович')).toBeDefined()
      })
    })

    it('renders correct eyebrow for admin users', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        user: {
          ...mockStandardProfile.user,
          role: 'admin',
        },
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('АДМИНИСТРАТОР')).toBeDefined()
      })
    })
  })

  describe('2. MembershipCard State Distinction', () => {
    it('renders active membership with big remaining visits and plain metadata expiry', () => {
      const membership: Membership = {
        id: 'mem_1',
        type: 'visits_package',
        title: 'Абонемент на 8 занятий',
        totalVisits: 8,
        visitsLeft: 5,
        expiresAt: '2026-10-15T00:00:00+03:00',
        status: 'active',
      }
      render(<MembershipCard membership={membership} />)

      expect(screen.getByText('5')).toBeDefined()
      expect(screen.getByText('из 8')).toBeDefined()
      expect(screen.getByText(/посещений осталось/)).toBeDefined()
      expect(screen.getByText(/До 15 октября/)).toBeDefined()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('renders warning in words when visitsLeft is 1', () => {
      const membership: Membership = {
        id: 'mem_low',
        type: 'visits_package',
        title: 'Абонемент на 8 занятий',
        totalVisits: 8,
        visitsLeft: 1,
        expiresAt: '2026-10-15T00:00:00+03:00',
        status: 'active',
      }
      render(<MembershipCard membership={membership} />)

      expect(screen.getByText('1')).toBeDefined()
      expect(screen.getByText('из 8')).toBeDefined()
      expect(screen.getByText('посещение осталось')).toBeDefined()
      const warning = screen.getByRole('status')
      expect(warning.textContent).toContain('Осталось 1 последнее посещение')
    })

    it('renders depleted / zero visits state honestly without broken math', () => {
      const membership: Membership = {
        id: 'mem_depleted',
        type: 'visits_package',
        title: 'Абонемент на 8 занятий',
        totalVisits: 8,
        visitsLeft: 0,
        expiresAt: '2026-10-15T00:00:00+03:00',
        status: 'depleted',
      }
      render(<MembershipCard membership={membership} />)

      expect(screen.getByText('0')).toBeDefined()
      expect(screen.getByText('из 8')).toBeDefined()
      expect(screen.getByText('Все посещения использованы')).toBeDefined()
      expect(screen.getByText(/Продлить абонемент можно у администратора клуба/)).toBeDefined()
    })

    it('renders expired membership with clear status text', () => {
      const membership: Membership = {
        id: 'mem_expired',
        type: 'visits_package',
        title: 'Абонемент на 8 занятий',
        totalVisits: 8,
        visitsLeft: 2,
        expiresAt: '2026-08-01T00:00:00+03:00',
        status: 'expired',
      }
      render(<MembershipCard membership={membership} />)

      expect(screen.getByText('Срок действия истёк')).toBeDefined()
      expect(screen.getByText(/Истёк 1 августа/)).toBeDefined()
      expect(screen.getByText(/Продлить абонемент можно у администратора клуба/)).toBeDefined()
    })

    it('renders no membership state with matching alignment', () => {
      render(<MembershipCard membership={null} />)

      expect(screen.getByText('Нет активного абонемента')).toBeDefined()
      expect(screen.getByText(/Продлить или приобрести абонемент можно у администратора клуба/)).toBeDefined()
    })

    it('renders unlimited membership without converting title to 0 visits and handles missing expiry', () => {
      const membership: Membership = {
        id: 'mem_unlimited',
        type: 'unlimited',
        title: 'Безлимитный на месяц',
        totalVisits: 0,
        visitsLeft: 0,
        expiresAt: null, // no expiry date known
        status: 'active',
      }
      render(<MembershipCard membership={membership} />)

      expect(screen.getByText('Безлимитный на месяц')).toBeDefined()
      expect(screen.queryByText(/на 0 посещений/)).toBeNull()
      expect(screen.getByText('Безлимит')).toBeDefined()
      expect(screen.getByText('Неограниченно посещений')).toBeDefined()
      // Should not invent an expiration date
      expect(screen.queryByText(/До /)).toBeNull()
    })
  })

  describe('3. History Section & Modal', () => {
    it('renders 3 latest visits on page and opens full modal without second panel', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('8 сентября')).toBeDefined()
      })

      expect(screen.getByText('5 сентября')).toBeDefined()
      expect(screen.getByText('1 сентября')).toBeDefined()

      // Full history button
      const allHistoryBtn = screen.getByRole('button', { name: /Показать всю историю посещений/ })
      fireEvent.click(allHistoryBtn)

      // Modal should be open
      expect(screen.getByRole('heading', { name: 'Вся история посещений' })).toBeDefined()
      const closeBtn = screen.getByRole('button', { name: /Закрыть историю/ })
      expect(closeBtn).toBeDefined()

      // Close modal
      fireEvent.click(closeBtn)
      await waitFor(() => {
        expect(screen.queryByRole('heading', { name: 'Вся история посещений' })).toBeNull()
      })
    })

    it('renders empty history state when no visits exist', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        history: [],
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Пока нет посещений')).toBeDefined()
      })
      expect(screen.getByRole('link', { name: 'Записаться на тренировку' })).toBeDefined()
      expect(screen.queryByRole('button', { name: /Показать всю историю посещений/ })).toBeNull()
    })

    it('renders long trainer names without clipping ellipsis in history', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        history: [
          {
            id: 'b_long',
            dateLabel: '8 сентября',
            time: '10:00–11:00',
            trainerId: 'dima',
            trainerName: 'Константинопольский Константин',
          },
        ],
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Константинопольский Константин')).toBeDefined()
      })
    })
  })

  describe('4. Settings, Semantics & Capabilities', () => {
    it('hides admin link for client users', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        user: { ...mockStandardProfile.user, role: 'client' },
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Алексей Смирнов')).toBeDefined()
      })
      expect(screen.queryByText('Админ-панель')).toBeNull()
    })

    it('shows admin link for admin users', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce({
        ...mockStandardProfile,
        user: { ...mockStandardProfile.user, role: 'admin' },
      })
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Админ-панель')).toBeDefined()
      })
      const adminLink = screen.getByRole('link', { name: /Перейти в админ-панель/ })
      expect(adminLink.getAttribute('href')).toBe('/admin')
    })

    it('links to real /integrations page', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Источники данных')).toBeDefined()
      })
      const integrationsLink = screen.getByRole('link', { name: /Подключить фитнес-трекеры и весы/ })
      expect(integrationsLink.getAttribute('href')).toBe('/integrations')
    })

    it('marks notifications as unavailable honestly without fake toggle', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Уведомления')).toBeDefined()
      })
      expect(screen.getByText('Недоступно в веб-версии · Требуется приложение')).toBeDefined()
      expect(screen.getByText('Недоступно')).toBeDefined()
      // There should not be a switch role
      expect(screen.queryByRole('switch')).toBeNull()
    })

    it('renames settings row to About application and reveals version info', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('О приложении')).toBeDefined()
      })
      const aboutBtn = screen.getByRole('button', { name: /О приложении/ })
      fireEvent.click(aboutBtn)

      expect(screen.getByText(/Приложение «Железный Рюрик» · Версия 0\.1\.0/)).toBeDefined()
    })

    it('shows honest disabled logout boundary without fake success dialog', async () => {
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByText('Выход из профиля')).toBeDefined()
      })
      expect(screen.getByText('Автономный режим без серверной авторизации')).toBeDefined()
      // No active fake "Выйти" button that displays a mock toast
      expect(screen.queryByRole('button', { name: 'Выйти из аккаунта' })).toBeNull()
    })
  })

  describe('5. Loading & Error States', () => {
    it('renders loading skeleton with aria-busy while fetching', () => {
      vi.mocked(getProfileData).mockReturnValue(new Promise(() => {}))
      renderWithClient(<ProfilePage />)

      const loadingPage = screen.getByLabelText('Загрузка профиля')
      expect(loadingPage.getAttribute('aria-busy')).toBe('true')
    })

    it('shows error state with retry button on API failure and refetches on click', async () => {
      vi.mocked(getProfileData).mockRejectedValueOnce(new Error('Network error'))
      renderWithClient(<ProfilePage />)

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeDefined()
      })

      expect(screen.getByText('Не удалось загрузить данные профиля')).toBeDefined()
      const retryBtn = screen.getByRole('button', { name: 'Повторить' })
      expect(retryBtn).toBeDefined()

      // Retry should refetch
      vi.mocked(getProfileData).mockResolvedValueOnce(mockStandardProfile)
      fireEvent.click(retryBtn)

      await waitFor(() => {
        expect(screen.getByText('Алексей Смирнов')).toBeDefined()
      })
    })
  })
})
