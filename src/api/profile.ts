import type { User } from '../types/domain'
import { apiRequest } from './client'
import { mapHistory, mapMembership, type ApiBooking, type ApiMembership } from './mappers'

interface ProfileResponse {
  user: { id: string; name: string; city: string; role: 'client' | 'trainer' | 'admin'; isActive: boolean }
  membership: ApiMembership | null
  history: ApiBooking[]
}
export async function getProfileData() {
  const data = await apiRequest<ProfileResponse>('/profile')
  return { user: data.user as User, membership: mapMembership(data.membership), history: data.history.map(mapHistory) }
}

