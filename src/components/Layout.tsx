import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import Button from './ui/Button'

export default function Layout() {
  const { signOut, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()

  const doLogout = async () => {
    try {
      await signOut()
    } finally {
      navigate('/login')
    }
  }

  return (
    <div className="gc-shell" data-theme={theme}>
      <aside className="gc-nav no-print">
        <div className="gc-brand">
          <img src="/logo.svg" alt="GastroChef" className="gc-brand__logo" />
          <div>
            <div className="gc-brand__name">GastroChef</div>
            <div className="gc-brand__sub">Kitchen OS</div>
          </div>
        </div>

        <nav className="gc-links">
          <NavLink to="/dashboard" className={({ isActive }) => `gc-link ${isActive ? 'active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/recipes" className={({ isActive }) => `gc-link ${isActive ? 'active' : ''}`}>Recipes</NavLink>
          <NavLink to="/cost-history" className={({ isActive }) => `gc-link ${isActive ? 'active' : ''}`}>Cost History</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `gc-link ${isActive ? 'active' : ''}`}>Settings</NavLink>
        </nav>

        <div className="gc-nav__footer">
          <div className="gc-user">
            <div className="gc-user__avatar">{(user?.email?.[0] || 'U').toUpperCase()}</div>
            <div className="gc-user__meta">
              <div className="gc-user__email">{user?.email || '—'}</div>
              <button className="gc-theme" onClick={toggleTheme} type="button">{theme === 'light' ? 'Dark' : 'Light'}</button>
            </div>
          </div>
          <Button variant="danger" onClick={doLogout} fullWidth>Logout</Button>
        </div>
      </aside>

      <main className="gc-main">
        <Outlet />
      </main>

      <style>{`
        .gc-shell{
          min-height: 100vh;
          display:grid;
          grid-template-columns: 280px 1fr;
          background: var(--surface-secondary);
        }
        .gc-nav{
          position: sticky;
          top: 0;
          height: 100vh;
          padding: 18px;
          background: var(--surface);
          border-right: 1px solid var(--border);
          display:flex;
          flex-direction: column;
          gap: 16px;
        }
        .gc-brand{ display:flex; gap: 12px; align-items:center; padding: 8px; border-radius: 14px; }
        .gc-brand__logo{ width: 42px; height: 42px; }
        .gc-brand__name{ font-weight: 800; color: var(--text-primary); }
        .gc-brand__sub{ font-size: .85rem; color: var(--text-tertiary); }

        .gc-links{ display:flex; flex-direction: column; gap: 8px; margin-top: 4px; }
        .gc-link{
          text-decoration:none;
          color: var(--text-primary);
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid transparent;
          background: transparent;
          font-weight: 600;
        }
        .gc-link:hover{ background: var(--surface-secondary); border-color: var(--border); }
        .gc-link.active{ background: color-mix(in oklab, var(--primary) 10%, transparent); border-color: color-mix(in oklab, var(--primary) 30%, var(--border)); }

        .gc-nav__footer{ margin-top:auto; display:flex; flex-direction: column; gap: 12px; }
        .gc-user{ display:flex; gap: 10px; align-items:center; padding: 10px; border-radius: 14px; border:1px solid var(--border); background: var(--surface-secondary); }
        .gc-user__avatar{ width: 38px; height: 38px; border-radius: 999px; display:grid; place-items:center; font-weight: 800; background: color-mix(in oklab, var(--primary) 18%, var(--surface)); border: 1px solid color-mix(in oklab, var(--primary) 30%, var(--border)); }
        .gc-user__email{ font-size: .9rem; color: var(--text-primary); font-weight: 700; }
        .gc-theme{ margin-top: 2px; border:none; background: transparent; color: var(--text-secondary); cursor:pointer; font-weight: 600; padding: 0; }
        .gc-theme:hover{ color: var(--text-primary); }

        .gc-main{ padding: 0; }

        @media (max-width: 980px){
          .gc-shell{ grid-template-columns: 1fr; }
          .gc-nav{ position: relative; height: auto; }
        }
      `}</style>
    </div>
  )
}
