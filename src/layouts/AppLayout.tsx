// src/layouts/AppLayout.tsx
import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useMode } from '../lib/mode'

function isActiveClass(isActive: boolean) {
  return isActive ? ' gc-nav-item-active' : ''
}

export default function AppLayout() {
  const { isKitchen, setKitchen, setMgmt } = useMode()

  const toggleDark = () => {
    document.documentElement.classList.toggle('gc-dark')
  }

  return (
    <div className="gc-app-shell">
      <aside className="gc-sidebar">
        <div className="gc-sidebar-card">
          <div className="gc-brand">
            <div className="gc-brand-name">GastroChef</div>
            <div className="gc-brand-sub">v4 MVP</div>
          </div>

          <div className="gc-sidebar-section">
            <div className="gc-label">MODE</div>

            <div className="gc-mode-switch">
              <button
                type="button"
                className={`gc-btn ${isKitchen ? 'gc-btn-primary' : 'gc-btn-ghost'}`}
                onClick={setKitchen}
              >
                Kitchen
              </button>

              <button
                type="button"
                className={`gc-btn ${!isKitchen ? 'gc-btn-primary' : 'gc-btn-ghost'}`}
                onClick={setMgmt}
              >
                Mgmt
              </button>
            </div>

            <div className="gc-hint">{isKitchen ? 'Kitchen mode is active.' : 'Management mode is active.'}</div>
          </div>

          <div className="gc-sidebar-section">
            <div className="gc-label">NAVIGATION</div>

            <nav className="gc-nav">
              <NavLink to="/dashboard" className={({ isActive }) => `gc-nav-item${isActiveClass(isActive)}`}>
                Dashboard
              </NavLink>

              <NavLink to="/ingredients" className={({ isActive }) => `gc-nav-item${isActiveClass(isActive)}`}>
                Ingredients
              </NavLink>

              <NavLink to="/recipes" className={({ isActive }) => `gc-nav-item${isActiveClass(isActive)}`}>
                Recipes
              </NavLink>

              <NavLink to="/settings" className={({ isActive }) => `gc-nav-item${isActiveClass(isActive)}`}>
                Settings
              </NavLink>
            </nav>

            <div className="gc-tip">Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
          </div>
        </div>
      </aside>

      <main className="gc-main">
        <div className="gc-topbar">
          <div className="gc-topbar-title">Enterprise UI · Premium SaaS layout</div>

          <button type="button" className="gc-btn gc-btn-ghost" onClick={toggleDark}>
            Dark Mode
          </button>
        </div>

        <div className="gc-content">
          {/* ✅ CRITICAL: render routed pages here */}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
