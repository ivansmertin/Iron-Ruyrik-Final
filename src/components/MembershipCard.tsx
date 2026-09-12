import { Calendar, TicketCheck } from 'lucide-react'
import type { Membership } from '../types/domain'
import { formatDateRu, pluralize } from '../utils/formatters'
import { Section } from './ui'

interface MembershipCardProps {
  membership: Membership | null
}

export function MembershipCard({ membership }: MembershipCardProps) {
  const isNone = !membership || membership.id === 'none' || membership.status === 'none'

  if (isNone || !membership) {
    return (
      <Section className="membership-card membership-card--empty" role="region" aria-label="Статус абонемента: нет активного абонемента">
        <div className="membership-card__head">
          <div className="membership-card__icon" aria-hidden="true">
            <TicketCheck size={22} />
          </div>
          <div className="membership-card__meta">
            <p className="eyebrow">Абонемент</p>
            <h3 className="membership-card__title">Нет активного абонемента</h3>
          </div>
        </div>
        <p className="membership-card__empty-text">
          Продлить или приобрести абонемент можно у администратора клуба.
        </p>
      </Section>
    )
  }

  const isUnlimited = membership.type === 'unlimited'
  const isExpired = membership.status === 'expired'
  const isDepleted = !isUnlimited && (membership.visitsLeft === 0 || membership.status === 'depleted')
  const isLowVisits = !isUnlimited && !isExpired && membership.visitsLeft === 1

  const expiryDate = membership.expiresAt ? formatDateRu(membership.expiresAt, 'long') : null

  const titleText = isUnlimited
    ? membership.title
    : membership.title.toLowerCase().startsWith('абонемент')
    ? membership.title
    : membership.totalVisits > 0
    ? `Абонемент на ${membership.totalVisits} ${pluralize(membership.totalVisits, 'посещение', 'посещения', 'посещений')}`
    : membership.title

  // Accessible label for screen readers
  let a11yLabel = `${titleText}. `
  if (isExpired) {
    a11yLabel += `Срок действия истёк${expiryDate ? ` ${expiryDate}` : ''}.`
  } else if (isUnlimited) {
    a11yLabel += `Безлимитный абонемент, неограниченно посещений${expiryDate ? `, действует до ${expiryDate}` : ''}.`
  } else if (isDepleted) {
    a11yLabel += `Все посещения использованы, 0 из ${membership.totalVisits}.${expiryDate ? ` Действовал до ${expiryDate}.` : ''}`
  } else {
    a11yLabel += `Осталось ${membership.visitsLeft} из ${membership.totalVisits} ${pluralize(membership.totalVisits, 'посещения', 'посещений', 'посещений')}.${expiryDate ? ` Действует до ${expiryDate}.` : ''}`
  }

  return (
    <Section className="membership-card" role="region" aria-label={a11yLabel}>
      <div className="membership-card__head">
        <div className="membership-card__icon" aria-hidden="true">
          <TicketCheck size={22} />
        </div>
        <div className="membership-card__meta">
          <p className="eyebrow">Абонемент</p>
          <h3 className="membership-card__title">{titleText}</h3>
        </div>
      </div>

      <div className="membership-card__body">
        {isExpired ? (
          <div className="membership-card__main-stat">
            <strong className="membership-card__status-text">Срок действия истёк</strong>
            <p className="membership-card__empty-text">
              Продлить абонемент можно у администратора клуба.
            </p>
          </div>
        ) : isUnlimited ? (
          <div className="membership-card__main-stat">
            <strong className="membership-card__big-number">Безлимит</strong>
            <span className="membership-card__stat-label">Неограниченно посещений</span>
          </div>
        ) : (
          <div className="membership-card__main-stat">
            <div className="membership-card__stat-row">
              <strong className="membership-card__big-number">{membership.visitsLeft}</strong>
              <span className="membership-card__stat-total">из {membership.totalVisits}</span>
            </div>
            <span className="membership-card__stat-label">
              {isDepleted
                ? 'Все посещения использованы'
                : pluralize(
                    membership.visitsLeft,
                    'посещение осталось',
                    'посещения осталось',
                    'посещений осталось'
                  )}
            </span>
            {isDepleted && (
              <p className="membership-card__empty-text">
                Продлить абонемент можно у администратора клуба.
              </p>
            )}
          </div>
        )}

        {expiryDate && (
          <div className="membership-card__expiry">
            <Calendar size={14} aria-hidden="true" />
            <span>{isExpired ? `Истёк ${expiryDate}` : `До ${expiryDate}`}</span>
          </div>
        )}
      </div>

      {isLowVisits && (
        <div className="membership-card__warning-badge" role="status">
          <span>Осталось 1 последнее посещение</span>
        </div>
      )}
    </Section>
  )
}

