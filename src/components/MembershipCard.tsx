import { Calendar, TicketCheck } from 'lucide-react'
import type { Membership } from '../types/domain'
import { formatDateRu, pluralize } from '../utils/formatters'
import { Section } from './ui'

interface MembershipCardProps {
  membership: Membership | null
}

export function MembershipCard({ membership }: MembershipCardProps) {
  const hasActiveMembership =
    membership &&
    membership.id !== 'none' &&
    membership.status !== 'expired' &&
    membership.status !== 'depleted'

  if (!hasActiveMembership || !membership) {
    return (
      <Section className="membership-card membership-card--empty" role="region" aria-label="Статус абонемента">
        <div className="membership-card__head">
          <div className="membership-card__icon membership-card__icon--muted" aria-hidden="true">
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
  const isLowVisits = !isUnlimited && membership.visitsLeft === 1
  const isDepleted = !isUnlimited && membership.visitsLeft === 0

  const expiryDate = membership.expiresAt ? formatDateRu(membership.expiresAt, 'long') : null
  const totalWord = pluralize(membership.totalVisits, 'посещение', 'посещения', 'посещений')
  const titleText = membership.title.toLowerCase().startsWith('абонемент')
    ? membership.title
    : `Абонемент на ${membership.totalVisits} ${totalWord}`

  const a11yLabel = isUnlimited
    ? `Безлимитный абонемент${expiryDate ? `, действует до ${expiryDate}` : ''}`
    : `Абонемент: осталось ${membership.visitsLeft} из ${membership.totalVisits} ${totalWord}${
        expiryDate ? `, действует до ${expiryDate}` : ''
      }`

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
        {isUnlimited ? (
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
              {isDepleted ? 'Все посещения использованы' : 'посещений осталось'}
            </span>
          </div>
        )}

        {expiryDate && (
          <div className="membership-card__expiry">
            <Calendar size={13} aria-hidden="true" />
            <span>До {expiryDate}</span>
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
