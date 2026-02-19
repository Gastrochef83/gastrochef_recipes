// src/layouts/AppLayout.tsx
import { NavLink } from 'react-router-dom'
import { useMode } from '../lib/mode'

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ')
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isKitchen, setKitchen, setMgmt } = useMode()

  return (
    <div className="gc-app-shell">
      {/* SIDEBAR */}
      <aside className="gc-sidebar">
        <div className="gc-card p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-lg font-extrabold">GastroChef</div>
              <div className="text-xs text-neutral-500">v4 MVP</div>
            </div>
          </div>

          {/* Mode Switch */}
          <div className="mt-4">
            <div className="gc-label">MODE</div>

            <div className="mt-2 rounded-2xl border border-neutral-200 bg-white p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  className={cx('gc-btn', isKitchen ? 'gc-btn-primary' : 'gc-btn-ghost')}
                  onClick={setKitchen}
                >
                  Kitchen
                </button>
                <button
                  type="button"
                  className={cx('gc-btn', !isKitchen ? 'gc-btn-primary' : 'gc-btn-ghost')}
                  onClick={setMgmt}
                >
                  Mgmt
                </button>
              </div>
            </div>

            <div className="mt-2 text-xs text-neutral-500">
              {isKitchen ? 'Kitchen mode is active.' : 'Management mode is active.'}
            </div>
          </div>
        </div>

        {/* NAV */}
        <div className="mt-4 gc-card p-3">
          <div className="gc-label mb-2">Navigation</div>

          <nav className="space-y-1">
            <NavItem to="/dashboard" label="Dashboard" />
            <NavItem to="/ingredients" label="Ingredients" />
            <NavItem to="/recipes" label="Recipes" />
            <NavItem to="/settings" label="Settings" />
          </nav>
        </div>

        <div className="mt-4 text-xs text-neutral-500 px-1">
          Tip: Use Kitchen for cooking view, Mgmt for costing & pricing.
        </div>
      </aside>

      {/* MAIN */}
      <main className="gc-main">
        {/* Topbar (optional, clean) */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-600">
            <span className="font-semibold text-neutral-900">Enterprise UI</span> · Premium SaaS layout
          </div>

          {/* You can add actions here later (Search / Profile / etc) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="gc-btn gc-btn-ghost"
              onClick={() => {
                document.documentElement.classList.toggle('dark')
              }}
            >
              Dark Mode
            </button>
          </div>
        </div>

        {children}
      </main>
    </div>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          'block rounded-2xl px-3 py-2 text-sm font-semibold border',
          isActive
            ? 'bg-black text-white border-transparent'
            : 'bg-white text-neutral-800 border-neutral-200 hover:border-neutral-300'
        )
      }
    >
      {label}
    </NavLink>
  )
}
