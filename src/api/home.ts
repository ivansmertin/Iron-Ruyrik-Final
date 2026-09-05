import type { GymCapacity, User } from '../types/domain'
import { apiRequest } from './client'
import { mapBooking, mapMembership, type ApiBooking, type ApiMembership } from './mappers'

interface HomeResponse { user: { id: string; name: string; city: string }; membership: ApiMembership | null; nextBooking: ApiBooking | null; currentOccupancy: number; capacity: number }

export async function getHomeData() {
  const data = await apiRequest<HomeResponse>('/home')
  return { user: data.user as User, membership: mapMembership(data.membership),
    activeBooking: data.nextBooking ? mapBooking(data.nextBooking) : null,
    capacity: { occupied: data.currentOccupancy, limit: data.capacity } satisfies GymCapacity }
}

