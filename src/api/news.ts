import type { NewsResponse } from '../types/domain'
import { apiRequest } from './client'

export async function getGymNews(): Promise<NewsResponse> {
  return apiRequest<NewsResponse>('/news')
}
