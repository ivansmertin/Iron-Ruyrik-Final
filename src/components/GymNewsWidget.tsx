import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Eye, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { getGymNews } from '../api/news'
import { Card, Skeleton } from './ui'

function TelegramIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.52 2.77-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .37z" />
    </svg>
  )
}

function formatPostDate(isoString: string | null): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const now = new Date()
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear()

    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const isYesterday =
      date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()

    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

    if (isToday) return `Сегодня, ${timeStr}`
    if (isYesterday) return `Вчера, ${timeStr}`

    const monthStr = date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })
    return `${monthStr}, ${timeStr}`
  } catch {
    return ''
  }
}

export function GymNewsWidget() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['gymNews'],
    queryFn: getGymNews,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  })

  const [activeIndex, setActiveIndex] = useState(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)

  if (isLoading) {
    return (
      <div className="gym-news-section" aria-label="Новости зала">
        <div className="gym-news-header">
          <span className="eyebrow gym-news-header__eyebrow">НОВОСТИ ЗАЛА</span>
          <span className="gym-news-header__channel">@goverrun</span>
        </div>
        <Card className="gym-news-card gym-news-card--skeleton">
          <Skeleton className="skeleton--row" style={{ height: '36px', marginBottom: '12px' }} />
          <Skeleton className="skeleton--hero" style={{ height: '110px', marginBottom: '12px' }} />
          <Skeleton className="skeleton--title" style={{ width: '80%', height: '20px' }} />
        </Card>
      </div>

    )
  }

  const posts = data?.posts && data.posts.length > 0 ? data.posts.slice(0, 5) : []
  const channelUrl = data?.channelUrl ?? 'https://t.me/goverrun'
  const channelHandle = data?.channelHandle ?? '@goverrun'
  const currentPost = posts[activeIndex] ?? null

  if (!currentPost || isError) {
    return (
      <div className="gym-news-section" aria-label="Новости зала">
        <div className="gym-news-header">
          <span className="eyebrow gym-news-header__eyebrow">НОВОСТИ ЗАЛА</span>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gym-news-header__link"
          >
            <TelegramIcon size={14} />
            <span>{channelHandle}</span>
            <ExternalLink size={12} />
          </a>
        </div>
        <Card className="gym-news-card gym-news-card--fallback">
          <p className="gym-news-card__fallback-text">
            Следите за тренировками, режимом и новостями зала в авторском канале Дмитрия Говера.
          </p>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--secondary gym-news-card__btn"
          >
            <TelegramIcon size={16} />
            <span>Перейти в @goverrun</span>
          </a>
        </Card>
      </div>
    )
  }

  const dateLabel = formatPostDate(currentPost.date)
  const isLongText = currentPost.text.length > 170
  const displayText =
    !isExpanded && isLongText
      ? `${currentPost.text.slice(0, 160).trim()}...`
      : currentPost.text

  const hasImage = Boolean(currentPost.imageUrl) && !imageFailed

  const handlePrev = () => {
    setImageFailed(false)
    setIsExpanded(false)
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : posts.length - 1))
  }

  const handleNext = () => {
    setImageFailed(false)
    setIsExpanded(false)
    setActiveIndex((prev) => (prev < posts.length - 1 ? prev + 1 : 0))
  }

  return (
    <div className="gym-news-section" aria-label="Новости зала">
      <div className="gym-news-header">
        <div className="gym-news-header__left">
          <span className="eyebrow gym-news-header__eyebrow">НОВОСТИ ЗАЛА</span>
        </div>

        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="gym-news-header__link"
          title="Открыть канал Говер на движениях в Telegram"
        >
          <TelegramIcon size={14} />
          <span>{channelHandle}</span>
          <ExternalLink size={11} />
        </a>
      </div>

      <Card className="gym-news-card">
        {/* Author row */}
        <div className="gym-news-card__author-bar">
          <div className="gym-news-card__author-info">
            <div className="gym-news-card__avatar" aria-hidden="true">
              <span>ДГ</span>
            </div>
            <div className="gym-news-card__author-meta">
              <span className="gym-news-card__author-name">Дмитрий Говер</span>
              <span className="gym-news-card__author-role">Основатель и тренер</span>
            </div>
          </div>

          <div className="gym-news-card__meta-right">
            {dateLabel && <span className="gym-news-card__date">{dateLabel}</span>}
          </div>
        </div>

        {/* Media Preview if post has image */}
        {hasImage && currentPost.imageUrl && (
          <div className="gym-news-card__media-wrapper">
            <img
              src={currentPost.imageUrl}
              alt="Фото к новости зала"
              className="gym-news-card__media"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
            <div className="gym-news-card__media-gradient" />
          </div>
        )}

        {/* Post Text */}
        {currentPost.text && (
          <div className="gym-news-card__body">
            <p className="gym-news-card__text">{displayText}</p>
            {isLongText && (
              <button
                type="button"
                className="gym-news-card__toggle-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? 'Свернуть' : 'Читать дальше'}
              </button>
            )}
          </div>
        )}

        {/* Footer actions & pagination */}
        <div className="gym-news-card__footer">
          {posts.length > 1 ? (
            <div className="gym-news-card__nav" aria-label="Переключение новостей">
              <button
                type="button"
                className="gym-news-card__nav-arrow"
                onClick={handlePrev}
                aria-label="Предыдущая новость"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="gym-news-card__dots">
                {posts.map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`gym-news-card__dot ${idx === activeIndex ? 'is-active' : ''}`}
                    onClick={() => {
                      setImageFailed(false)
                      setIsExpanded(false)
                      setActiveIndex(idx)
                    }}
                    aria-label={`Перейти к новости ${idx + 1}`}
                  />
                ))}
              </div>
              <button
                type="button"
                className="gym-news-card__nav-arrow"
                onClick={handleNext}
                aria-label="Следующая новость"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : (
            currentPost.views && (
              <span className="gym-news-card__views">
                <Eye size={12} />
                <span>{currentPost.views}</span>
              </span>
            )
          )}

          <a
            href={currentPost.url || channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gym-news-card__post-link"
          >
            <TelegramIcon size={14} />
            <span>В Telegram</span>
          </a>
        </div>
      </Card>
    </div>
  )
}
