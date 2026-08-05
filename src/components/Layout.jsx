import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium ${
    isActive ? 'bg-brand-50 text-brand-900' : 'text-gray-600 hover:bg-gray-100'
  }`

export default function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-1">
            <span className="mr-4 font-semibold text-gray-900">Team Tasks</span>
            <NavLink to="/tasks" className={linkClass}>
              Tasks
            </NavLink>
            <NavLink to="/documents" className={linkClass}>
              Documents
            </NavLink>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{profile?.full_name ?? 'Loading…'}</span>
            <button onClick={signOut} className="text-gray-500 hover:text-gray-900">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
