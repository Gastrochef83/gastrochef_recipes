import { NavLink } from 'react-router-dom'

const Item = ({ to, label }: { to: string; label: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) => ['gc-nav-item', isActive && 'is-active'].filter(Boolean).join(' ')}
  >
    {label}
  </NavLink>
)

export default function SideNav() {
  return (
    <aside className="w-56 shrink-0">
      <div className="gc-side-card">
        <div className="px-1 pb-2 text-[11px] font-extrabold tracking-[0.16em] text-[color:rgba(11,18,32,.52)]">
          NAVIGATION
        </div>
        <nav className="gc-nav" aria-label="Primary">
          <Item to="/" label="Dashboard" />
          <Item to="/ingredients" label="Ingredients" />
          <Item to="/recipes" label="Recipes" />
          <Item to="/settings" label="Settings" />
        </nav>
      </div>
    </aside>
  )
}
