import { apiRequest } from './client'
import { mapBooking, type ApiBooking } from './mappers'

export interface AdminSettings { gymCapacity: number; defaultBookingDurationMinutes: number; bookingStepMinutes: number; cancelBeforeMinutes: number; timezone: string }
export interface ApiBlock { id: string; startAt: string; endAt: string; type: string; reason: string | null; createdAt: string }

export async function getAdminBookings() { return (await apiRequest<ApiBooking[]>('/admin/bookings')).map(mapBooking) }
export async function getAdminSettings() { return apiRequest<AdminSettings>('/admin/settings') }
export async function patchAdminSettings(data: Partial<AdminSettings>) { return apiRequest<AdminSettings>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }) }
export async function getBookingBlocks() { return apiRequest<ApiBlock[]>('/admin/booking-blocks') }
export async function createBookingBlock(startAt: string, endAt: string) { return apiRequest<ApiBlock>('/admin/booking-blocks', { method: 'POST', body: JSON.stringify({ startAt, endAt, type: 'closed', reason: 'Закрыто администратором' }) }) }
export async function deleteBookingBlock(id: string) { return apiRequest<void>(`/admin/booking-blocks/${id}`, { method: 'DELETE' }) }
export async function addAdminBooking(clientName: string, slotId: string) {
  return mapBooking(await apiRequest<ApiBooking>('/admin/bookings', { method: 'POST', body: JSON.stringify({ clientName, slotId }) }))
}

