import type { BookingMode, TimeSlot } from '../types/domain'
import { apiRequest } from './client'
import { mapBooking, type ApiBooking } from './mappers'

export async function getBookings() { return (await apiRequest<ApiBooking[]>('/bookings')).map(mapBooking) }
export async function createBooking(slot: TimeSlot, mode: BookingMode) {
  const data = await apiRequest<ApiBooking>('/bookings', { method: 'POST', body: JSON.stringify({ slotId: slot.id, trainerSlug: mode === 'self' ? null : mode }) })
  return mapBooking(data)
}
export async function cancelBooking(id: string) {
  return mapBooking(await apiRequest<ApiBooking>(`/bookings/${id}/cancel`, { method: 'POST' }))
}

