/* eslint-disable react-refresh/only-export-components */
import {
  createBrowserRouter,
  createRoutesFromElements,
  Outlet,
  Route,
  RouterProvider,
} from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { BookingProvider } from './features/bookings/BookingContext'
import { AdminPage } from './pages/AdminPage'
import { BookingPage } from './pages/BookingPage'
import { HomePage } from './pages/HomePage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProgressPage } from './pages/ProgressPage'
import { SchedulePage } from './pages/SchedulePage'
import { TrainerPage } from './pages/TrainerPage'
import { TrainersPage } from './pages/TrainersPage'

function RootLayout() {
  return (
    <BookingProvider>
      <Outlet />
    </BookingProvider>
  )
}

export const routes = createRoutesFromElements(
  <Route element={<RootLayout />}>
    <Route element={<AppShell />}>
      <Route index element={<HomePage />} />
      <Route path="schedule" element={<SchedulePage />} />
      <Route path="trainers" element={<TrainersPage />} />
      <Route path="trainers/:id" element={<TrainerPage />} />
      <Route path="booking/:id" element={<BookingPage />} />
      <Route path="progress" element={<ProgressPage />} />
      <Route path="profile" element={<ProfilePage />} />
      <Route path="integrations" element={<IntegrationsPage />} />
      <Route path="404" element={<NotFoundPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Route>
    <Route path="admin" element={<AdminPage />} />
  </Route>
)

export const router = createBrowserRouter(routes)

export default function App() {
  return <RouterProvider router={router} />
}

