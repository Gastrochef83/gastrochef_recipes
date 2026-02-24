import { NavLink } from 'react-router-dom'

const Item = ({ to, label }: { to: string; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      [
        'block rounded-xl px-3 py-2 text-sm',
        isActive ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100',
      ].join(' ')
    }
  >
    {label}
  </NavLink>
)

export default function SideNav() {
  return (
    <aside className="w-56 shrink-0">
      <div className="rounded-2xl border bg-white p-3">
        <div className="px-2 pb-2 text-xs font-semibold text-neutral-500">NAVIGATION</div>
        <div className="space-y-1">
          <Item to="/" label="Dashboard" />
          <Item to="/ingredients" label="Ingredients" />
          <Item to="/recipes" label="Recipes" />
          <Item to="/settings" label="Settings" />
        </div>
      </div>
    </aside>
  )
}
