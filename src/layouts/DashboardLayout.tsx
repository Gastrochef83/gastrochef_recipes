// src/layouts/DashboardLayout.tsx
import { Outlet } from 'react-router-dom'
import { useMode } from '../lib/mode'

export default function DashboardLayout() {
  const { mode } = useMode()

  return (
    <div className="neo-dashboard-layout">
      <div className="neo-dashboard-header">
        <div className="neo-dashboard-title-section">
          <h1 className="neo-dashboard-title">
            {mode === 'kitchen' ? 'Kitchen Operations' : 'Business Analytics'}
          </h1>
          <p className="neo-dashboard-subtitle">
            {mode === 'kitchen' 
              ? 'Manage your daily kitchen operations' 
              : 'Track costs, margins, and performance metrics'}
          </p>
        </div>
      </div>
      <div className="neo-dashboard-content">
        <Outlet />
      </div>
    </div>
  )
}
