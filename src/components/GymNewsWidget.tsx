import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getGymNews } from '../api/news'
import { Skeleton } from './ui'

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

  const posts = data?.posts && data.posts.length > 0 ? data.posts.slice(0, 5) : []
  const safeActiveIndex = posts.length > 0 ? Math.min(activeIndex, posts.length - 1) : 0
  const currentPost = posts[safeActiveIndex] ?? null

  useEffect(() => {
    if (posts.length > 0 && activeIndex >= posts.length) {
      setActiveIndex(posts.length - 1)
    }
  }, [posts.length, activeIndex])

  useEffect(() => {
    setImageFailed(false)
  }, [currentPost?.id])

  if (isLoading) {
    return (
      <section className="gym-news-feed gym-news-feed--skeleton" aria-label="Новости зала">
        <div className="gym-news-feed__header">
          <span className="eyebrow gym-news-feed__eyebrow">НОВОСТИ ЗАЛА</span>
          <Skeleton style={{ width: '80px', height: '14px' }} />
        </div>
        <div className="gym-news-feed__post">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Skeleton style={{ width: '36px', height: '36px', borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <Skeleton style={{ width: '110px', height: '14px' }} />
              <Skeleton style={{ width: '150px', height: '12px' }} />
            </div>
          </div>
          <Skeleton style={{ width: '100%', height: '180px', marginBottom: '14px', borderRadius: '2px' }} />
          <Skeleton style={{ width: '95%', height: '14px', marginBottom: '6px' }} />
          <Skeleton style={{ width: '70%', height: '14px' }} />
        </div>
      </section>
    )
  }

  const channelUrl = data?.channelUrl ?? 'https://t.me/goverrun'
  const channelHandle = data?.channelHandle ?? '@goverrun'
  const authorName = data?.authorName || 'Дмитрий Говер'
  const authorRole = data?.authorRole || 'Основатель и тренер'
  const initials = authorName
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'ДГ'

  if (isError) {
    return (
      <section className="gym-news-feed" aria-label="Новости зала">
        <div className="gym-news-feed__header">
          <span className="eyebrow gym-news-feed__eyebrow">НОВОСТИ ЗАЛА</span>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gym-news-feed__channel-link"
            aria-label={`Канал ${channelHandle} в Telegram (откроется в новой вкладке)`}
          >
            <TelegramIcon size={14} />
            <span>{channelHandle}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
        <div className="gym-news-feed__fallback">
          <p className="gym-news-feed__fallback-text">
            Не удалось загрузить новости. Свежие обновления доступны в канале зала.
          </p>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--secondary gym-news-feed__btn"
          >
            <TelegramIcon size={16} />
            <span>Перейти в {channelHandle}</span>
          </a>
        </div>
      </section>
    )
  }

  if (posts.length === 0 || !currentPost) {
    return (
      <section className="gym-news-feed" aria-label="Новости зала">
        <div className="gym-news-feed__header">
          <span className="eyebrow gym-news-feed__eyebrow">НОВОСТИ ЗАЛА</span>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gym-news-feed__channel-link"
            aria-label={`Канал ${channelHandle} в Telegram (откроется в новой вкладке)`}
          >
            <TelegramIcon size={14} />
            <span>{channelHandle}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
        <div className="gym-news-feed__fallback">
          <p className="gym-news-feed__fallback-text">
            Следите за тренировками, режимом и новостями зала в авторском канале Дмитрия Говера.
          </p>
          <a
            href={channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="button button--secondary gym-news-feed__btn"
          >
            <TelegramIcon size={16} />
            <span>Перейти в {channelHandle}</span>
          </a>
        </div>
      </section>
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
    setIsExpanded(false)
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : posts.length - 1))
  }

  const handleNext = () => {
    setIsExpanded(false)
    setActiveIndex((prev) => (prev < posts.length - 1 ? prev + 1 : 0))
  }

  return (
    <section className="gym-news-feed" aria-label="Новости зала">
      <div className="gym-news-feed__header">
        <span className="eyebrow gym-news-feed__eyebrow">НОВОСТИ ЗАЛА</span>
        <a
          href={channelUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="gym-news-feed__channel-link"
          aria-label={`Канал ${channelHandle} в Telegram (откроется в новой вкладке)`}
        >
          <TelegramIcon size={14} />
          <span>{channelHandle}</span>
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      <article className="gym-news-feed__post">
        {/* Author Bar */}
        <div className="gym-news-feed__author">
          <div className="gym-news-feed__avatar" aria-hidden="true">
            <span>{initials}</span>
          </div>
          <div className="gym-news-feed__author-meta">
            <span className="gym-news-feed__author-name">{authorName}</span>
            <span className="gym-news-feed__author-role">
              {authorRole}{dateLabel ? ` · ${dateLabel}` : ''}
            </span>
          </div>
        </div>

        {/* Large Media Preview */}
        {hasImage && currentPost.imageUrl && (
          <div className="gym-news-feed__media-wrap">
            <img
              src={currentPost.imageUrl}
              alt="Фото к новости зала"
              className="gym-news-feed__media"
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          </div>
        )}

        {/* Post Text */}
        {currentPost.text && (
          <div className="gym-news-feed__body">
            <p className="gym-news-feed__text">{displayText}</p>
            {isLongText && (
              <button
                type="button"
                className="gym-news-feed__toggle-btn"
                aria-expanded={isExpanded}
                onClick={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? 'Свернуть' : 'Читать дальше'}
              </button>
            )}
          </div>
        )}

        {/* Footer actions & pagination */}
        <div className="gym-news-feed__footer">
          {posts.length > 1 ? (
            <div className="gym-news-feed__pagination" aria-label="Переключение новостей">
              <button
                type="button"
                className="gym-news-feed__nav-btn"
                onClick={handlePrev}
                aria-label="Предыдущая новость"
              >
                <ChevronLeft size={16} />
              </button>
              <div
                className="gym-news-feed__dots-indicator"
                role="status"
                aria-label={`Новость ${safeActiveIndex + 1} из ${posts.length}`}
              >
                {posts.map((_, idx) => (
                  <span
                    key={idx}
                    className={`gym-news-feed__dot ${idx === safeActiveIndex ? 'is-active' : ''}`}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <button
                type="button"
                className="gym-news-feed__nav-btn"
                onClick={handleNext}
                aria-label="Следующая новость"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          ) : <div />}

          {currentPost.url && currentPost.url !== channelUrl ? (
            <a
              href={currentPost.url}
              target="_blank"
              rel="noopener noreferrer"
              className="gym-news-feed__post-link"
              aria-label="Открыть публикацию в Telegram (откроется в новой вкладке)"
            >
              <TelegramIcon size={14} />
              <span>К публикации</span>
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </article>
    </section>
  )
}
