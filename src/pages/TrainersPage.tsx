import { useQuery } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react'
import { TrainerCard } from '../components/TrainerCard'
import { ButtonLink, PageHeader, Skeleton } from '../components/ui'
import { getTrainers } from '../api/trainers'

export function TrainersPage() {
  const { data, isLoading } = useQuery({ queryKey: ['trainers'], queryFn: getTrainers })

  if (isLoading || !data) {
    return (
      <div className="page trainers-page" aria-busy="true" aria-label="Загрузка списка тренеров">
        <PageHeader eyebrow="Команда" title="Наши тренеры" />
        <p className="page-intro">Выберите тренера под свою задачу или занимайтесь самостоятельно.</p>
        <div className="trainer-grid" aria-hidden="true">
          <Skeleton className="trainer-card-skeleton" />
          <Skeleton className="trainer-card-skeleton" />
        </div>
      </div>
    )
  }

  return (
    <div className="page trainers-page">
      <PageHeader eyebrow="Команда" title="Наши тренеры" />
      <p className="page-intro">Выберите тренера под свою задачу или занимайтесь самостоятельно.</p>

      <div className="trainer-grid">
        {data.map((trainer) => (
          <TrainerCard key={trainer.id} trainer={trainer} />
        ))}
      </div>

      {/* Secondary scenario: self workout */}
      <section className="self-training-section" aria-label="Самостоятельная тренировка">
        <div className="self-training-card">
          <div className="self-training-card__info">
            <span className="eyebrow self-training-card__eyebrow">САМОСТОЯТЕЛЬНО</span>
            <h3 className="self-training-card__title">Хотите заниматься самостоятельно?</h3>
            <p className="self-training-card__desc">
              Доступ к залу и всему оборудованию по предварительной записи.
            </p>
          </div>
          <ButtonLink
            to="/schedule"
            variant="secondary"
            className="self-training-card__btn"
            aria-label="Выбрать время для самостоятельной тренировки"
          >
            <span>Выбрать время</span>
            <ArrowRight size={16} aria-hidden="true" />
          </ButtonLink>
        </div>
      </section>
    </div>
  )
}
