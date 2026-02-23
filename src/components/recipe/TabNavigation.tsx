import React from 'react'

type TabDef<T extends string> = { id: T; label: string }

export default function TabNavigation<T extends string>({
  activeTab,
  onTabChange,
  tabs
}: {
  activeTab: T | null
  onTabChange: (t: T | null) => void
  tabs: TabDef<T>[]
}) {
  return (
    <div className="tabs no-print">
      {tabs.map(t => (
        <button
          key={t.id}
          type="button"
          className={`tab ${activeTab === t.id ? 'active' : ''}`}
          onClick={() => onTabChange(activeTab === t.id ? null : t.id)}
        >
          {t.label}
        </button>
      ))}

      <style>{`
        .tabs{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 12px;
          border-radius: 14px;
          background: var(--surface);
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
        }
        .tab{
          border: 1px solid var(--border);
          background: var(--surface-secondary);
          color: var(--text-primary);
          padding: 10px 12px;
          border-radius: 12px;
          cursor:pointer;
          font-weight: 800;
        }
        .tab:hover{ background: var(--surface-tertiary); }
        .tab.active{
          background: color-mix(in oklab, var(--primary) 15%, var(--surface));
          border-color: color-mix(in oklab, var(--primary) 35%, var(--border));
        }
      `}</style>
    </div>
  )
}
