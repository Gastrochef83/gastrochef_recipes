import { NavLink } from 'react-router-dom'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `block rounded-2xl px-4 py-3 text-sm font-semibold ${
          isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export default function AppLayout({
  children,
  userEmail,
  onSignOut,
}: {
  children: React.ReactNode
  userEmail?: string | null
  onSignOut?: () => void
}) {
  return (
    <div className="min-h-screen">
      <div className="container-app">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
          <aside className="gc-card p-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-neutral-900" />
              <div>
                <div className="text-sm font-extrabold">GastroChef</div>
                <div className="text-xs text-neutral-500">V4 MVP</div>
              </div>
            </div>

            <div className="mt-6">
              <div className="gc-label">NAVIGATION</div>
              <div className="mt-3 space-y-2">
                <NavItem to="/" label="Dashboard" />
                <NavItem to="/ingredients" label="Ingredients" />
                <NavItem to="/recipes" label="Recipes" />
                <NavItem to="/settings" label="Settings" />
              </div>
            </div>

            <div className="mt-6 border-t pt-4">
              <div className="text-xs text-neutral-500">Signed in</div>
              <div className="mt-1 text-sm font-semibold text-neutral-800">{userEmail ?? '—'}</div>
              <button className="mt-3 w-full gc-btn gc-btn-ghost" onClick={onSignOut} type="button">
                Sign out
              </button>
            </div>
          </aside>

          <main className="space-y-6">{children}</main>
        </div>
      </div>
    </div>
  )
}

