import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Tasks from './pages/Tasks'
import Documents from './pages/Documents'

function Private({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <div className="p-8 text-center text-gray-500">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <Private>
            <Layout />
          </Private>
        }
      >
        <Route index element={<Navigate to="/tasks" replace />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="documents" element={<Documents />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
