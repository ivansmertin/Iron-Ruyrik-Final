import { apiRequest } from './client'
import { mapTrainer, type ApiTrainer } from './mappers'

export async function getTrainers() { return (await apiRequest<ApiTrainer[]>('/trainers')).map(mapTrainer) }

