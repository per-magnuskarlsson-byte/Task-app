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
            <div className="mr-4 flex flex-col items-center leading-none">
              <img src="/logo.png" alt="KungsAir" className="h-7 w-auto" />
              <span className="mt-0.5 text-[10px] font-semibold tracking-wide text-gray-900">KungsAir</span>
            </div>
            <NavLink to="/tasks" className={linkClass}>
              Tasks
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
