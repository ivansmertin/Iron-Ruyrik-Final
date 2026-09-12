# Issue: Условные значения тренировок и серии недель в HealthService.get_progress

**Статус**: Open  
**Компонент**: Backend (`app.services.health.service.HealthService`) / Product  
**Обнаружено на этапе**: M08 (Visual Migration «Железный Рюрик»)  
**Дата**: 11.09.2026  

---

## 1. Описание проблемы

В методе `HealthService.get_progress` (файл `backend/app/services/health/service.py`, строки 466–484) расчет метрик активности `visits_this_month` и `consistent_weeks` содержит эвристические/фиктивные подстановки:

```python
visits_this_month = self.session.scalar(
    select(func.count()).select_from(Booking).where(
        Booking.user_id == user_id,
        Booking.status.in_([BookingStatus.CONFIRMED, BookingStatus.COMPLETED]),
        Booking.start_at >= month_start_utc,
    )
) or 0

# Fallback to realistic value if user has history (e.g. 3)
if visits_this_month == 0:
    total_history = self.session.scalar(
        select(func.count()).select_from(Booking).where(
            Booking.user_id == user_id,
            Booking.status == BookingStatus.COMPLETED,
        )
    ) or 0
    visits_this_month = min(3, total_history) if total_history > 0 else 0

consistent_weeks = 3 if visits_this_month > 0 else 0
```

### Проблемы:
1. **Ложный fallback на 3 тренировки**: если у пользователя в текущем календарном месяце еще не было тренировок (например, наступило 1-е число месяца), но в прошлом есть завершенные тренировки, сервис возвращает `visits_this_month = 3`. Пользователь видит «3 тренировки за месяц», чего фактически не было.
2. **Захардкоженная серия `consistent_weeks = 3`**: показатель «3 недели подряд» никогда не вычисляется по реальному календарю и недельным интервалам посещений. Он всегда равен `3`, если `visits_this_month > 0`, и `0` в противном случае.
3. **Недостоверность данных**: представление этих показателей как доказанных фактов нарушает принцип честности и достоверности спортивного приложения.

---

## 2. Временное решение в UI (Этап M08)

В соответствии с требованиями итерации M08:
- Отображение верхнего блока «ТРЕНИРОВКИ / ДИСЦИПЛИНА» (`progress-summary-section`) скрыто на экране «Мой прогресс» (`ProgressPage.tsx`).
- Фронтенд **не вычисляет** синтетический streak, чтобы не создавать альтернативный источник недостоверных данных.
- Полная и достоверная история тренировок пользователя по-прежнему доступна в разделе «Профиль» (`ProfilePage.tsx`).

---

## 3. Рекомендации по исправлению на бэкенде

1. **Честный расчет `visits_this_month`**:
   Удалить блок `if visits_this_month == 0: visits_this_month = min(3, total_history)`. Если тренировок в текущем месяце 0 — возвращать честный `0`.
2. **Алгоритмический расчет непрерывной серии `consistent_weeks`**:
   - Извлечь даты завершенных тренировок пользователя (`Booking.status == BookingStatus.COMPLETED`).
   - Сгруппировать посещения по номерам календарных недель (ISO week).
   - Вычислить непрерывную цепочку недель, начиная с текущей или предыдущей недели, где было хотя бы одно посещение.
   - Возвращать реальное число непрерывных недель (0, 1, 2, ...).
3. **Обновление контракта и тестов**:
   - Обновить тесты в `backend/tests/test_health_integrations.py` на проверку реального алгоритма подсчета серии.
   - После готовности бэкенда вернуть блок серии в UI с доказанным значением.
