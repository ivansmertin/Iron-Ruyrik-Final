import { useQuery } from '@tanstack/react-query'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { TrainerCard } from '../components/TrainerCard'
import { Button, ButtonLink, PageHeader, Skeleton } from '../components/ui'
import { getTrainers } from '../api/trainers'

export function TrainersPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['trainers'],
    queryFn: getTrainers,
  })

  return (
    <div className="page trainers-page">
      <PageHeader eyebrow="Команда" title="Наши тренеры" />
      <p className="page-intro">
        Выберите тренера под свою задачу или занимайтесь самостоятельно.
      </p>

      {/* 1. Loading State */}
      {isLoading && (
        <div
          className="trainer-list trainer-list--loading"
          aria-busy="true"
          aria-label="Загрузка списка тренеров"
        >
          <div className="trainer-entity-skeleton">
            <div className="trainer-entity-skeleton__header">
              <Skeleton className="trainer-entity-skeleton__avatar" />
              <div className="trainer-entity-skeleton__text">
                <Skeleton style={{ width: '60px', height: '12px', marginBottom: '8px' }} />
                <Skeleton style={{ width: '180px', height: '28px' }} />
              </div>
            </div>
            <Skeleton style={{ width: '100%', height: '40px', marginTop: '14px' }} />
            <Skeleton style={{ width: '140px', height: '44px', marginTop: '16px' }} />
          </div>
          <div className="trainer-list__divider" role="separator" />
          <div className="trainer-entity-skeleton">
            <div className="trainer-entity-skeleton__header">
              <Skeleton className="trainer-entity-skeleton__avatar" />
              <div className="trainer-entity-skeleton__text">
                <Skeleton style={{ width: '60px', height: '12px', marginBottom: '8px' }} />
                <Skeleton style={{ width: '180px', height: '28px' }} />
              </div>
            </div>
            <Skeleton style={{ width: '100%', height: '40px', marginTop: '14px' }} />
            <Skeleton style={{ width: '140px', height: '44px', marginTop: '16px' }} />
          </div>
        </div>
      )}

      {/* 2. Error State */}
      {!isLoading && isError && (
        <div className="trainers-state trainers-state--error" role="alert">
          <p className="trainers-state__message">
            Не удалось загрузить список тренеров. Проверьте соединение и повторите попытку.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => refetch()}
            disabled={isFetching}
            className="trainers-state__btn"
          >
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
            <span>{isFetching ? 'Загрузка…' : 'Повторить попытку'}</span>
          </Button>
        </div>
      )}

      {/* 3. Empty State */}
      {!isLoading && !isError && data && data.length === 0 && (
        <div className="trainers-state trainers-state--empty" role="status">
          <p className="trainers-state__message">
            В данный момент список тренеров обновляется. Вы можете записаться на самостоятельную
            тренировку в расписании.
          </p>
        </div>
      )}

      {/* 4. Loaded Trainers List */}
      {!isLoading && !isError && data && data.length > 0 && (
        <div className="trainer-list trainer-grid">
          {data.map((trainer, index) => (
            <div key={trainer.id} className="trainer-list__item">
              {index > 0 && <div className="trainer-list__divider" role="separator" />}
              <TrainerCard trainer={trainer} />
            </div>
          ))}
        </div>
      )}

      {/* 5. Self-Training Open Footer Row */}
      <section className="self-training-row self-training-section" aria-label="Самостоятельная тренировка">
        <div className="self-training-row__info self-training-card__info">
          <span className="eyebrow self-training-row__eyebrow self-training-card__eyebrow">
            САМОСТОЯТЕЛЬНО
          </span>
          <h3 className="self-training-row__title self-training-card__title">
            Хотите заниматься самостоятельно?
          </h3>
          <p className="self-training-row__desc self-training-card__desc">
            Доступ к залу и всему оборудованию по предварительной записи.
          </p>
        </div>
        <ButtonLink
          to="/schedule"
          variant="secondary"
          className="self-training-row__btn self-training-card__btn"
          aria-label="Выбрать время для самостоятельной тренировки"
        >
          <span>Выбрать время</span>
          <ArrowRight size={16} aria-hidden="true" />
        </ButtonLink>
      </section>
    </div>
  )
}
