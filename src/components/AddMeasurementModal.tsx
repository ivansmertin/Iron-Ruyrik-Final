import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { addManualHealthMeasurement } from '../api/health'
import { Button } from './ui'

interface AddMeasurementModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddMeasurementModal({ isOpen, onClose }: AddMeasurementModalProps) {
  const queryClient = useQueryClient()

  // Default to current local date and time in YYYY-MM-DDTHH:MM
  const getDefaultDateTime = () => {
    const now = new Date()
    const offset = now.getTimezoneOffset()
    const local = new Date(now.getTime() - offset * 60 * 1000)
    return local.toISOString().slice(0, 16)
  }

  const [dateTime, setDateTime] = useState(getDefaultDateTime)
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [muscleMass, setMuscleMass] = useState('')
  const [notes, setNotes] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setDateTime(getDefaultDateTime())
      setWeight('')
      setBodyFat('')
      setMuscleMass('')
      setNotes('')
      setErrorMessage(null)
      setSuccess(false)
    }
  }, [isOpen])

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const mutation = useMutation({
    mutationFn: addManualHealthMeasurement,
    onSuccess: () => {
      setSuccess(true)
      queryClient.invalidateQueries({ queryKey: ['health-progress'] })
      queryClient.invalidateQueries({ queryKey: ['progress'] })
      setTimeout(() => {
        onClose()
      }, 700)
    },
    onError: (err: Error) => {
      setErrorMessage(err.message || 'Не удалось сохранить замер. Проверьте введённые данные.')
    },
  })

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const wNum = weight ? parseFloat(weight.replace(',', '.')) : undefined
    const fNum = bodyFat ? parseFloat(bodyFat.replace(',', '.')) : undefined
    const mNum = muscleMass ? parseFloat(muscleMass.replace(',', '.')) : undefined

    if (wNum === undefined && fNum === undefined && mNum === undefined) {
      setErrorMessage('Укажите хотя бы один показатель: вес, процент жира или мышечную массу.')
      return
    }

    if (wNum !== undefined && (isNaN(wNum) || wNum <= 20 || wNum >= 400)) {
      setErrorMessage('Пожалуйста, введите корректный вес в килограммах (от 20 до 400 кг).')
      return
    }

    if (fNum !== undefined && (isNaN(fNum) || fNum < 1 || fNum > 70)) {
      setErrorMessage('Пожалуйста, введите корректный процент жира (от 1 до 70%).')
      return
    }

    if (mNum !== undefined && (isNaN(mNum) || mNum <= 5 || mNum >= 200)) {
      setErrorMessage('Пожалуйста, введите корректную мышечную массу (от 5 до 200 кг).')
      return
    }

    const isoDate = new Date(dateTime).toISOString()
    mutation.mutate({
      measuredAt: isoDate,
      weight: wNum,
      bodyFat: fNum,
      muscleMass: mNum,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-measurement-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-content health-measurement-modal">
        <div className="modal-header">
          <h3 id="add-measurement-title">Записать замер</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть окно"
          >
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="modal-success-state" role="status">
            <div className="success-icon-badge">
              <Check size={28} />
            </div>
            <h4>Замер сохранён</h4>
            <p>Данные добавлены в каноническую историю прогресса.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="measurement-form">
            <div className="form-group">
              <label htmlFor="measurement-datetime">Дата и время замера</label>
              <input
                id="measurement-datetime"
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                required
                className="form-input"
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="measurement-weight">Вес (кг)</label>
                <input
                  id="measurement-weight"
                  type="text"
                  inputMode="decimal"
                  placeholder="78,2"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="form-input"
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label htmlFor="measurement-fat">Жир (%)</label>
                <input
                  id="measurement-fat"
                  type="text"
                  inputMode="decimal"
                  placeholder="14,8"
                  value={bodyFat}
                  onChange={(e) => setBodyFat(e.target.value)}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="measurement-muscle">Мышечная масса (кг)</label>
              <input
                id="measurement-muscle"
                type="text"
                inputMode="decimal"
                placeholder="36,5"
                value={muscleMass}
                onChange={(e) => setMuscleMass(e.target.value)}
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label htmlFor="measurement-notes">Заметка (необязательно)</label>
              <input
                id="measurement-notes"
                type="text"
                placeholder="После утренней тренировки"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={255}
                className="form-input"
              />
            </div>

            {errorMessage && (
              <div className="form-error" role="alert">
                {errorMessage}
              </div>
            )}

            <div className="form-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={mutation.isPending}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={mutation.isPending}
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 size={16} className="spin-icon" /> Сохранение...
                  </>
                ) : (
                  'Сохранить'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
