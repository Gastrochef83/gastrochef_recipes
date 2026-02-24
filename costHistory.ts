import React from 'react'
import Button from '../ui/Button'

type Tab = { id: string; label: string }

export default function TabNavigation({
  activeTab,
  onTabChange,
  tabs
}: {
  activeTab: string | null
  onTabChange: (tab: any) => void
  tabs: Tab[]
}) {
  return (
    <div className="gc-tabs">
      {tabs.map((t) => (
        <Button
          key={t.id}
          variant={activeTab === t.id ? 'primary' : 'secondary'}
          onClick={() => onTabChange(activeTab === t.id ? null : (t.id as any))}
        >
          {t.label}
        </Button>
      ))}
    </div>
  )
}
