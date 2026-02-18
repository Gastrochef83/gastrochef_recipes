// src/layouts/AppLayout.tsx

import { NavLink, Outlet } from 'react-router-dom'
import { useMode } from '../lib/mode'

export default function AppLayout() {
  const { isKitchen, toggleMode } = useMode()

  return (
    <div className="h-screen w-screen bg-neutral-100">
      <div className="flex h-full">

        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">

          <div className="p-6 border-b border-neutral-200">
            <div className="text-lg font-extrabold tracking-tight">
              GastroChef
            </div>
            <div className="text-xs text-neutral-500 mt-1">
              v4 MVP
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">

            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `block rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`
              }
            >
              Dashboard
            </NavLink>

            <NavLink
              to="/ingredients"
              className={({ isActive }) =>
                `block rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`
              }
            >
              Ingredients
            </NavLink>

            <NavLink
              to="/recipes"
              className={({ isActive }) =>
                `block rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`
              }
            >
              Recipes
            </NavLink>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `block rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-black text-white'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`
              }
            >
              Settings
            </NavLink>
          </nav>

          <div className="p-4 border-t border-neutral-200">
            <button
              onClick={toggleMode}
              className="w-full rounded-xl bg-neutral-100 hover:bg-neutral-200 text-sm font-semibold py-2 transition"
            >
              Mode: {isKitchen ? 'Kitchen' : 'Mgmt'}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
