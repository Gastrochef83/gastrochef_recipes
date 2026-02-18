// src/layouts/AppLayout.tsx

import { NavLink, Outlet } from 'react-router-dom'
import { useMode } from '../lib/mode'

export default function AppLayout() {
  const { isKitchen, isMgmt, toggleMode } = useMode()

  return (
    <div className="min-h-screen bg-neutral-100 flex">

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">

        {/* Logo */}
        <div className="p-6 border-b border-neutral-200">
          <div className="text-lg font-extrabold">GastroChef</div>
          <div className="text-xs text-neutral-500">v4 MVP</div>
        </div>

        {/* Mode Switch */}
        <div className="p-4 border-b border-neutral-200">
          <div className="text-xs font-semibold text-neutral-500 mb-2">
            MODE
          </div>

          <div className="flex rounded-xl bg-neutral-100 p-1">
            <button
              onClick={() => isMgmt && toggleMode()}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
                isKitchen
                  ? 'bg-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Kitchen
            </button>

            <button
              onClick={() => isKitchen && toggleMode()}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition ${
                isMgmt
                  ? 'bg-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              Mgmt
            </button>
          </div>
        </div>

        {/* Navigation */}
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

      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-[1400px] mx-auto">
          <Outlet />
        </div>
      </main>

    </div>
  )
}
