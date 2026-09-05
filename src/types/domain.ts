export type TrainerId = 'dima' | 'vanya'
export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show'
export type BookingMode = 'self' | TrainerId

export interface User {
  id: string
  name: string
  city: string
  role?: 'client' | 'trainer' | 'admin'
  isActive?: boolean
}

export interface Trainer {
  id: TrainerId
  name: string
  specialties: string[]
  about: string
}

export interface Booking {
  id: string
  clientName: string
  slotId: string
  userId: string
  dateLabel: string
  date: string
  startAt: string
  endAt: string
  trainerId: TrainerId | null
  trainerName: string | null
  status: BookingStatus
  title: string
  createdAt: string
  cancelledAt: string | null
}

export interface Membership {
  id: string
  type: 'subscription' | 'visits_package' | 'unlimited'
  title: string
  totalVisits: number
  visitsLeft: number
  expiresAt?: string | null
  status?: string
}

export interface Measurement {
  id: string
  date: string
  weight: number
  bodyFat?: number
  muscleMass?: number
  sourceProvider?: string
  sourceDevice?: string
  provenanceLabel?: string
}

export interface GymCapacity {
  occupied: number
  limit: number
}

export interface TimeSlot {
  id: string
  dateId: string
  date: string
  dateLabel: string
  startAt: string
  endAt: string
  startIso: string
  endIso: string
  occupied: number
  capacity: number
  isBlocked: boolean
}

export interface ScheduleDay {
  id: string
  weekday: string
  day: number
  monthLabel: string
}

export interface VisitHistoryItem {
  id: string
  dateLabel: string
  time: string
  trainerId: TrainerId | null
  trainerName: string | null
}

export interface NewsPost {
  id: string
  postNumber: number
  url: string
  text: string
  date: string | null
  imageUrl: string | null
  views: string | null
}

export interface NewsResponse {
  channelTitle: string
  channelHandle: string
  channelUrl: string
  authorName: string
  authorRole: string
  posts: NewsPost[]
}

