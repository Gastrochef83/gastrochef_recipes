import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout() {
  const { signOut, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const nav = useNavigate()

  const base = (import.meta as any).env?.BASE_URL || '/'

  const onLogout = async () => {
    await signOut()
    nav('/login')
  }

  return (
    <div className="gc-app" data-theme={theme}>
      <aside className="gc-sidebar">
        <div className="gc-brand">
          <img className="gc-brand-logo" src={`${base}gastrochef-logo.png`} alt="GastroChef" />
          <div className="gc-brand-text">
            <div className="gc-brand-name">GastroChef</div>
            <div className="gc-brand-sub">Kitchen Intelligence</div>
          </div>
        </div>

        <nav className="gc-nav">
          <NavLink to="/dashboard" className={({ isActive }) => `gc-nav__item ${isActive ? 'is-active' : ''}`}>Dashboard</NavLink>
          <NavLink to="/recipes" className={({ isActive }) => `gc-nav__item ${isActive ? 'is-active' : ''}`}>Recipes</NavLink>
          <NavLink to="/cost-history" className={({ isActive }) => `gc-nav__item ${isActive ? 'is-active' : ''}`}>Cost History</NavLink>
          <NavLink to="/settings" className={({ isActive }) => `gc-nav__item ${isActive ? 'is-active' : ''}`}>Settings</NavLink>
        </nav>

        <div className="gc-sidebar__footer">
          <button className="gc-nav__item" onClick={toggleTheme} type="button">Toggle Theme</button>
          <button className="gc-nav__item gc-nav__danger" onClick={onLogout} type="button">Logout</button>
          <div className="gc-user">{user?.email ?? ''}</div>
        </div>
      </aside>

      <main className="gc-main">
        <Outlet />
      </main>
    </div>
  )
}
