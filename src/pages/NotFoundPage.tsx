import { ArrowLeft } from 'lucide-react'
import { ButtonLink, Card } from '../components/ui'

export function NotFoundPage() {
  return (
    <div className="page not-found-page">
      <Card><span className="not-found-page__code">404</span><h1>Такой страницы нет</h1><p>Вернитесь на главную или откройте расписание.</p><ButtonLink to="/"><ArrowLeft size={19} /> На главную</ButtonLink><ButtonLink to="/schedule" variant="secondary">К расписанию</ButtonLink></Card>
    </div>
  )
}
