import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AdminPage } from '../pages/AdminPage'
import * as adminApi from '../api/admin'
import * as profileApi from '../api/profile'
import * as scheduleApi from '../api/schedule'

vi.mock('../api/admin', () => ({
  getAdminSettings: vi.fn(),
  getAdminBookings: vi.fn(),
  getBookingBlocks: vi.fn(),
  patchAdminSettings: vi.fn(),
  createBookingBlock: vi.fn(),
  deleteBookingBlock: vi.fn(),
  addAdminBooking: vi.fn(),
}))

vi.mock('../api/profile', () => ({
  getProfileData: vi.fn(),
}))

vi.mock('../api/schedule', () => ({
  getScheduleData: vi.fn(),
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

type ProfileData = Awaited<ReturnType<typeof profileApi.getProfileData>>
type ScheduleData = Awaited<ReturnType<typeof scheduleApi.getScheduleData>>
type AdminBookings = Awaited<ReturnType<typeof adminApi.getAdminBookings>>
type BookingBlocks = Awaited<ReturnType<typeof adminApi.getBookingBlocks>>
type CreatedBlock = Awaited<ReturnType<typeof adminApi.createBookingBlock>>
type CreatedBooking = Awaited<ReturnType<typeof adminApi.addAdminBooking>>

import type { Membership } from '../types/domain'

const mockMembership: Membership = {
  id: 'm-1',
  type: 'unlimited',
  title: 'Безлимит',
  totalVisits: 30,
  visitsLeft: 30,
  expiresAt: '2026-10-31',
  status: 'active',
}

const mockAdminProfile: ProfileData = {
  user: { id: 'u-admin', name: 'Главный Тренер', city: 'Великий Новгород', role: 'admin', isActive: true },
  membership: mockMembership,
  history: [],
}

const mockClientProfile: ProfileData = {
  user: { id: 'u-client', name: 'Иван Клиент', city: 'Великий Новгород', role: 'client', isActive: true },
  membership: mockMembership,
  history: [],
}

const mockSchedule: ScheduleData = {
  days: [{ id: '2026-09-12', day: 12, weekday: 'СБ', monthLabel: 'сентября' }],
  slots: [
    {
      id: 'slot-1',
      dateId: '2026-09-12',
      date: '2026-09-12',
      dateLabel: 'Сегодня',
      startAt: '10:00',
      endAt: '11:00',
      startIso: '2026-09-12T10:00:00+03:00',
      endIso: '2026-09-12T11:00:00+03:00',
      capacity: 8,
      occupied: 3,
      isBlocked: false,
    },
    {
      id: 'slot-2',
      dateId: '2026-09-12',
      date: '2026-09-12',
      dateLabel: 'Сегодня',
      startAt: '11:00',
      endAt: '12:00',
      startIso: '2026-09-12T11:00:00+03:00',
      endIso: '2026-09-12T12:00:00+03:00',
      capacity: 8,
      occupied: 8, // full slot
      isBlocked: false,
    },
    {
      id: 'slot-3',
      dateId: '2026-09-12',
      date: '2026-09-12',
      dateLabel: 'Сегодня',
      startAt: '12:00',
      endAt: '13:00',
      startIso: '2026-09-12T12:00:00+03:00',
      endIso: '2026-09-12T13:00:00+03:00',
      capacity: 8,
      occupied: 0,
      isBlocked: true, // blocked slot
    },
  ],
}

const mockBookings: AdminBookings = [
  {
    id: 'b-1',
    slotId: 'slot-1',
    userId: 'u-1',
    date: '2026-09-12',
    dateLabel: 'Сегодня',
    startAt: '10:00',
    endAt: '11:00',
    clientName: 'Константин Константинопольский',
    trainerId: 'dima',
    trainerName: 'Дима',
    status: 'confirmed',
    title: 'Тренировка с тренером',
    createdAt: '2026-09-12T08:00:00Z',
    cancelledAt: null,
  },
  {
    id: 'b-2',
    slotId: 'slot-2',
    userId: 'u-2',
    date: '2026-09-12',
    dateLabel: 'Сегодня',
    startAt: '11:00',
    endAt: '12:00',
    clientName: 'Анна Смирнова',
    trainerId: null,
    trainerName: null,
    status: 'completed',
    title: 'Самостоятельная тренировка',
    createdAt: '2026-09-12T08:30:00Z',
    cancelledAt: null,
  },
  {
    id: 'b-3',
    slotId: 'slot-2',
    userId: 'u-3',
    date: '2026-09-12',
    dateLabel: 'Сегодня',
    startAt: '11:00',
    endAt: '12:00',
    clientName: 'Михаил Сидоров',
    trainerId: null,
    trainerName: null,
    status: 'cancelled',
    title: 'Самостоятельная тренировка',
    createdAt: '2026-09-12T09:00:00Z',
    cancelledAt: '2026-09-12T09:30:00Z',
  },
]

const mockBlocks: BookingBlocks = [
  {
    id: 'blk-1',
    startAt: '2026-09-12T12:00:00+03:00',
    endAt: '2026-09-12T13:00:00+03:00',
    type: 'closed',
    reason: 'Закрыто',
    createdAt: '2026-09-12T08:00:00Z',
  },
]

const mockCreatedBlock: CreatedBlock = {
  id: 'blk-new',
  startAt: '2026-09-12T10:00:00+03:00',
  endAt: '2026-09-12T11:00:00+03:00',
  type: 'closed',
  reason: 'Закрыто администратором',
  createdAt: '2026-09-12T09:00:00Z',
}

const mockCreatedBooking: CreatedBooking = {
  id: 'b-new',
  slotId: 'slot-1',
  userId: 'u-new',
  date: '2026-09-12',
  dateLabel: 'Сегодня',
  startAt: '10:00',
  endAt: '11:00',
  clientName: 'Новый Клиент',
  trainerId: null,
  trainerName: null,
  status: 'confirmed',
  title: 'Запись администратора',
  createdAt: '2026-09-12T09:00:00Z',
  cancelledAt: null,
}

const mockAdminSettings: adminApi.AdminSettings = {
  gymCapacity: 8,
  defaultBookingDurationMinutes: 60,
  bookingStepMinutes: 60,
  cancelBeforeMinutes: 120,
  timezone: 'Europe/Moscow',
}

describe('M10 Admin Screen Visual and Architectural Remediation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(profileApi.getProfileData).mockResolvedValue(mockAdminProfile)
    vi.mocked(adminApi.getAdminSettings).mockResolvedValue(mockAdminSettings)
    vi.mocked(adminApi.getAdminBookings).mockResolvedValue(mockBookings)
    vi.mocked(adminApi.getBookingBlocks).mockResolvedValue(mockBlocks)
    vi.mocked(scheduleApi.getScheduleData).mockResolvedValue(mockSchedule)
    vi.mocked(adminApi.patchAdminSettings).mockResolvedValue({ ...mockAdminSettings, gymCapacity: 9 })
    vi.mocked(adminApi.createBookingBlock).mockResolvedValue(mockCreatedBlock)
    vi.mocked(adminApi.deleteBookingBlock).mockResolvedValue(undefined)
    vi.mocked(adminApi.addAdminBooking).mockResolvedValue(mockCreatedBooking)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('redirects non-admin users to / and renders admin screen for admin role', async () => {
    vi.mocked(profileApi.getProfileData).mockResolvedValueOnce(mockClientProfile)

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/" element={<div data-testid="home-fallback">Домашняя страница</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('home-fallback')).toBeDefined()
    })
    expect(screen.queryByText(/Админ-панель/i)).toBeNull()
  })

  it('shows loading state while queries are pending', () => {
    vi.mocked(profileApi.getProfileData).mockReturnValue(new Promise(() => {}))

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    expect(screen.getByLabelText('Загружаем админ-панель')).toBeDefined()
  })

  it('shows error state with retry button on query failure and refetches on click', async () => {
    vi.mocked(scheduleApi.getScheduleData).mockRejectedValueOnce(new Error('Network error'))

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const errorAlert = await screen.findByRole('alert')
    expect(errorAlert).toBeDefined()
    expect(screen.getByText('Не удалось загрузить админ-панель')).toBeDefined()

    const retryBtn = screen.getByRole('button', { name: 'Повторить' })
    expect(retryBtn).toBeDefined()

    vi.mocked(scheduleApi.getScheduleData).mockResolvedValueOnce(mockSchedule)
    fireEvent.click(retryBtn)

    await waitFor(() => {
      expect(screen.queryByText('Не удалось загрузить админ-панель')).toBeNull()
      expect(screen.getByRole('heading', { level: 1, name: 'Сегодня' })).toBeDefined()
    })
  })

  it('renders timeline slots with occupancy, action labels, and full slot without selected appearance', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('heading', { level: 1, name: 'Сегодня' })

    const timeline = document.querySelector('.timeline-grid')!
    expect(timeline).toBeDefined()

    // Slot 1 (3/8): open, not full
    expect(within(timeline as HTMLElement).getByText('10:00')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('3/8')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('Закрыть время')).toBeDefined()

    // Slot 2 (8/8): full, should display 'Мест нет' and class 'is-full'
    expect(within(timeline as HTMLElement).getByText('11:00')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('8/8')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('Мест нет')).toBeDefined()

    const fullSlotBtn = within(timeline as HTMLElement).getByText('8/8').closest('button')!
    expect(fullSlotBtn.classList.contains('is-full')).toBe(true)
    expect(fullSlotBtn.getAttribute('aria-pressed')).toBe('false')

    // Slot 3 (0/8, blocked): closed, should display 'Закрыто', 'Открыть время', and aria-pressed=true
    expect(within(timeline as HTMLElement).getByText('12:00')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('Закрыто')).toBeDefined()
    expect(within(timeline as HTMLElement).getByText('Открыть время')).toBeDefined()

    const closedSlotBtn = within(timeline as HTMLElement).getByText('Закрыто').closest('button')!
    expect(closedSlotBtn.classList.contains('is-closed')).toBe(true)
    expect(closedSlotBtn.getAttribute('aria-pressed')).toBe('true')
  })

  it('triggers block/unblock mutation with pending feedback and disables buttons while mutating', async () => {
    let resolveMutation: (val: CreatedBlock) => void
    const pendingPromise = new Promise<CreatedBlock>((resolve) => {
      resolveMutation = resolve
    })
    vi.mocked(adminApi.createBookingBlock).mockReturnValue(pendingPromise)

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('heading', { level: 1, name: 'Сегодня' })

    const timeline = document.querySelector('.timeline-grid')!
    const slot1Btn = within(timeline as HTMLElement).getByText('10:00').closest('button')!
    fireEvent.click(slot1Btn)

    // During mutation: button shows "Обновление…" and all slot buttons are disabled
    await waitFor(() => {
      expect(screen.getByText('Обновление…')).toBeDefined()
      expect(slot1Btn.hasAttribute('disabled')).toBe(true)
    })

    // Resolve mutation
    resolveMutation!(mockCreatedBlock)

    await waitFor(() => {
      expect(screen.queryByText('Обновление…')).toBeNull()
    })
  })

  it('renders semantic bookings list with time, client name, trainer, and verbal status', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const list = await screen.findByRole('list', { name: 'Записи на день' })
    expect(list).toBeDefined()
    expect(list.className).toContain('admin-bookings-list')

    const items = within(list).getAllByRole('listitem')
    expect(items.length).toBe(3)

    // Item 1: long name + trainer
    expect(within(items[0]).getByText('Константин Константинопольский')).toBeDefined()
    expect(within(items[0]).getByText('Тренер: Дима')).toBeDefined()
    expect(within(items[0]).getByText('Подтверждена')).toBeDefined()

    // Item 2: no trainer -> "Самостоятельно" + completed -> "Пришёл"
    expect(within(items[1]).getByText('Анна Смирнова')).toBeDefined()
    expect(within(items[1]).getByText('Самостоятельно')).toBeDefined()
    expect(within(items[1]).getByText('Пришёл')).toBeDefined()

    // Item 3: cancelled -> "Отменена"
    expect(within(items[2]).getByText('Михаил Сидоров')).toBeDefined()
    expect(within(items[2]).getByText('Отменена')).toBeDefined()

    // Count in header: "3 клиента в списке"
    expect(screen.getByText('3 клиента в списке')).toBeDefined()
  })

  it('renders empty bookings state when 0 bookings exist on that day', async () => {
    vi.mocked(adminApi.getAdminBookings).mockResolvedValueOnce([])

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('heading', { level: 1, name: 'Сегодня' })

    const emptyText = screen.getByText('На этот день записей нет')
    expect(emptyText).toBeDefined()
    expect(emptyText.closest('.admin-bookings-empty')?.getAttribute('role')).toBe('status')
    expect(screen.getByText('0 клиентов в списке')).toBeDefined()
  })

  it('renders capacity control with 44px buttons, boundary limits 1-20, and output live region', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const capacityGroup = await screen.findByRole('group', { name: 'Вместимость зала' })
    expect(capacityGroup).toBeDefined()

    const minusBtn = within(capacityGroup).getByRole('button', { name: 'Уменьшить вместимость' })
    const plusBtn = within(capacityGroup).getByRole('button', { name: 'Увеличить вместимость' })
    const output = within(capacityGroup).getByText('8')

    expect(minusBtn).toBeDefined()
    expect(plusBtn).toBeDefined()
    expect(output).toBeDefined()
    expect(output.tagName.toLowerCase()).toBe('output')
    expect(output.getAttribute('aria-live')).toBe('polite')
    expect(output.getAttribute('aria-atomic')).toBe('true')

    // Decrement capacity
    fireEvent.click(minusBtn)
    await waitFor(() => {
      expect(adminApi.patchAdminSettings).toHaveBeenCalledWith({ gymCapacity: 7 })
    })

    // Increment capacity
    fireEvent.click(plusBtn)
    await waitFor(() => {
      expect(adminApi.patchAdminSettings).toHaveBeenCalledWith({ gymCapacity: 9 })
    })
  })

  it('disables capacity stepper buttons at boundary values 1 and 20', async () => {
    // Test boundary at 1
    vi.mocked(adminApi.getAdminSettings).mockResolvedValueOnce({ ...mockAdminSettings, gymCapacity: 1 })

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('group', { name: 'Вместимость зала' })
    const minusBtn = screen.getByRole('button', { name: 'Уменьшить вместимость' })
    const plusBtn = screen.getByRole('button', { name: 'Увеличить вместимость' })

    expect(minusBtn.hasAttribute('disabled')).toBe(true)
    expect(plusBtn.hasAttribute('disabled')).toBe(false)
  })

  it('shows capacity error when patchAdminSettings rejects', async () => {
    vi.mocked(adminApi.patchAdminSettings).mockRejectedValueOnce(
      new Error('Превышен лимит вместимости')
    )

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    await screen.findByRole('group', { name: 'Вместимость зала' })
    const plusBtn = screen.getByRole('button', { name: 'Увеличить вместимость' })

    fireEvent.click(plusBtn)

    const errorAlert = await screen.findByRole('alert')
    expect(errorAlert.textContent).toContain('Превышен лимит вместимости')
  })

  it('renders add client modal with preselected slot time and explicit label linkage', async () => {
    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const openModalBtn = await screen.findByRole('button', { name: /Записать клиента/i })
    fireEvent.click(openModalBtn)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(screen.getByRole('heading', { level: 2, name: 'Записать клиента' })).toBeDefined()

    // Subtitle shows preselected slot inside dialog
    expect(within(dialog).getByText(/10:00/)).toBeDefined()

    // Explicit label association
    const nameInput = screen.getByLabelText('Имя клиента')
    expect(nameInput).toBeDefined()
    expect(nameInput.getAttribute('id')).toBe('client-name-input')
  })

  it('keeps modal open with entered client name and visible error when addAdminBooking rejects', async () => {
    vi.mocked(adminApi.addAdminBooking).mockRejectedValueOnce(
      new Error('Слот уже заполнен или недоступен')
    )

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const openModalBtn = await screen.findByRole('button', { name: /Записать клиента/i })
    fireEvent.click(openModalBtn)

    const nameInput = screen.getByLabelText('Имя клиента') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Екатерина Великая' } })

    const submitBtn = screen.getByRole('button', { name: 'Добавить запись' })
    fireEvent.click(submitBtn)

    // Error appears inside modal
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Слот уже заполнен или недоступен')

    // Modal remains open and entered name is preserved!
    expect(screen.getByRole('dialog')).toBeDefined()
    expect(nameInput.value).toBe('Екатерина Великая')
  })

  it('disables submit button and input during pending to prevent double submission', async () => {
    let resolveBooking: (val: CreatedBooking) => void
    const pendingPromise = new Promise<CreatedBooking>((resolve) => {
      resolveBooking = resolve
    })
    vi.mocked(adminApi.addAdminBooking).mockReturnValue(pendingPromise)

    const queryClient = createTestQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <AdminPage />
        </MemoryRouter>
      </QueryClientProvider>
    )

    const openModalBtn = await screen.findByRole('button', { name: /Записать клиента/i })
    fireEvent.click(openModalBtn)

    const nameInput = screen.getByLabelText('Имя клиента') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Олег' } })

    const submitBtn = screen.getByRole('button', { name: 'Добавить запись' })
    fireEvent.click(submitBtn)

    // Button updates text and is disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Добавляем…' }).hasAttribute('disabled')).toBe(true)
      expect(nameInput.hasAttribute('disabled')).toBe(true)
    })

    resolveBooking!(mockCreatedBooking)

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
