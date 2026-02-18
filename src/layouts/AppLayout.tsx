import { NavLink, Outlet } from 'react-router-dom'
import { useMode } from '../lib/mode'
import { useState } from 'react'

export default function AppLayout() {

  const { mode, setMode, dark, toggleDark } = useMode()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen flex">

      {/* Sidebar */}
      <aside
        className={`transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        } bg-[var(--bg-card)] border-r border-[var(--border-main)] flex flex-col`}
      >

        {/* Top */}
        <div className="p-4 flex justify-between items-center border-b border-[var(--border-main)]">
          {!collapsed && <div className="font-bold">GastroChef</div>}
          <button onClick={() => setCollapsed(!collapsed)}>
            ☰
          </button>
        </div>

        {/* Mode Switch */}
        {!collapsed && (
          <div className="p-4 border-b border-[var(--border-main)]">
            <div className="flex rounded-xl bg-neutral-200 dark:bg-neutral-800 p-1 relative">
              <div
                className={`absolute top-1 bottom-1 w-1/2 rounded-lg bg-white dark:bg-black transition-all duration-300 ${
                  mode === 'kitchen' ? 'left-1' : 'left-1/2'
                }`}
              />

              <button
                onClick={() => setMode('kitchen')}
                className="relative flex-1 text-sm font-semibold"
              >
                Kitchen
              </button>

              <button
                onClick={() => setMode('mgmt')}
                className="relative flex-1 text-sm font-semibold"
              >
                Mgmt
              </button>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <NavLink to="/dashboard" className="block px-3 py-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800">
            Dashboard
          </NavLink>
          <NavLink to="/ingredients" className="block px-3 py-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800">
            Ingredients
          </NavLink>
          <NavLink to="/recipes" className="block px-3 py-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800">
            Recipes
          </NavLink>
          <NavLink to="/settings" className="block px-3 py-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800">
            Settings
          </NavLink>
        </nav>

        {/* Dark Mode Toggle */}
        {!collapsed && (
          <div className="p-4 border-t border-[var(--border-main)]">
            <button
              onClick={toggleDark}
              className="w-full py-2 rounded-lg bg-neutral-200 dark:bg-neutral-800"
            >
              {dark ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        )}

      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-y-auto bg-[var(--bg-main)]">
        <Outlet />
      </main>

    </div>
  )
}
