const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

const friendlyMessages: Record<string, string> = {
  GYM_CAPACITY_REACHED: 'Это место только что заняли. Выберите другое время.',
  TRAINER_NOT_AVAILABLE: 'Тренер уже занят в это время. Выберите другое время.',
  BOOKING_BLOCKED: 'В это время зал закрыт для записи.',
  USER_ALREADY_BOOKED: 'У вас уже есть тренировка в это время.',
  CANCELLATION_DEADLINE_PASSED: 'Срок отмены этой тренировки уже прошёл.',
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(friendlyMessages[code] ?? message)
  }
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(response.status, body?.error?.code ?? 'REQUEST_FAILED', body?.error?.message ?? 'Не удалось выполнить запрос.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

