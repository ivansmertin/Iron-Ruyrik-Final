import type { Booking, Membership, ScheduleDay, TimeSlot, Trainer, TrainerId, VisitHistoryItem } from '../types/domain'

export const APP_TIMEZONE = 'Europe/Moscow'

export interface ApiTrainer { id: string; slug: string; name: string; bio: string | null; specialties: string[]; isActive: boolean }
export interface ApiSlot { id: string; startAt: string; endAt: string; booked: number; capacity: number; available: number; isBlocked: boolean }
export interface ApiSchedule { timezone: string; capacity: number; days: Array<{ date: string; slots: ApiSlot[] }> }
export interface ApiBooking { id: string; userId: string; clientName: string; trainerSlug: string | null; trainerName: string | null; slotId: string | null; startAt: string; endAt: string; status: Booking['status']; notes: string | null; createdAt: string; cancelledAt: string | null }
export interface ApiMembership { id: string; name: string; type: 'visits_package' | 'unlimited'; startsAt: string; expiresAt: string | null; visitsTotal: number | null; visitsRemaining: number | null; status: string }

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', timeZone: APP_TIMEZONE })
const month = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: APP_TIMEZONE })
const dayNumber = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', timeZone: APP_TIMEZONE })
const clock = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: APP_TIMEZONE })
const fullDate = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: APP_TIMEZONE })

function trainerId(value: string | null): TrainerId | null { return value === 'dima' || value === 'vanya' ? value : null }
function title(value: string | null) { return value === 'vanya' ? 'Силовая тренировка' : value === 'dima' ? 'Тренировка на выносливость' : 'Самостоятельная тренировка' }
function localDate(iso: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(new Date(iso)) }

export function mapTrainer(item: ApiTrainer): Trainer {
  return { id: item.slug as TrainerId, name: item.name, specialties: item.specialties,
    about: item.bio ?? `Направления: ${item.specialties.join(', ')}.` }
}

export function mapBooking(item: ApiBooking): Booking {
  const date = localDate(item.startAt); const now = localDate(new Date().toISOString())
  return { id: item.id, clientName: item.clientName, slotId: item.slotId ?? '', userId: item.userId,
    dateLabel: date === now ? 'Сегодня' : fullDate.format(new Date(item.startAt)), date,
    startAt: clock.format(new Date(item.startAt)), endAt: clock.format(new Date(item.endAt)),
    trainerId: trainerId(item.trainerSlug), trainerName: item.trainerName, status: item.status,
    title: title(item.trainerSlug), createdAt: item.createdAt, cancelledAt: item.cancelledAt }
}

export function mapSchedule(data: ApiSchedule): { days: ScheduleDay[]; slots: TimeSlot[] } {
  const days = data.days.map(({ date }) => {
    const parsed = new Date(`${date}T12:00:00+03:00`)
    return { id: date, weekday: weekday.format(parsed).replace('.', '').toUpperCase(),
      day: Number(dayNumber.format(parsed)), monthLabel: month.format(parsed) }
  })
  const today = localDate(new Date().toISOString())
  const slots = data.days.flatMap((group) => group.slots.map((item) => ({
    id: item.id, dateId: group.date, date: group.date,
    dateLabel: group.date === today ? 'Сегодня' : `${weekday.format(new Date(item.startAt)).replace('.', '').toUpperCase()}, ${fullDate.format(new Date(item.startAt))}`,
    startAt: clock.format(new Date(item.startAt)), endAt: clock.format(new Date(item.endAt)),
    startIso: item.startAt, endIso: item.endAt, occupied: item.booked, capacity: item.capacity, isBlocked: item.isBlocked,
  })))
  return { days, slots }
}

export function mapMembership(item: ApiMembership | null): Membership {
  return {
    id: item?.id ?? 'none',
    type: item?.type ?? 'visits_package',
    title: item?.name ?? 'Нет активного абонемента',
    totalVisits: item?.visitsTotal ?? 0,
    visitsLeft: item?.visitsRemaining ?? 0,
    expiresAt: item?.expiresAt ?? null,
    status: item?.status ?? 'none',
  }
}

export function mapHistory(item: ApiBooking): VisitHistoryItem {
  const booking = mapBooking(item)
  return { id: item.id, dateLabel: fullDate.format(new Date(item.startAt)), time: `${booking.startAt}–${booking.endAt}`,
    trainerId: booking.trainerId, trainerName: item.trainerName }
}
