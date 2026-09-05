import { apiRequest } from './client'
import { mapSchedule, type ApiSchedule } from './mappers'

export async function getScheduleData() { return mapSchedule(await apiRequest<ApiSchedule>('/schedule')) }

