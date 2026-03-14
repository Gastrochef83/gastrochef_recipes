import { ReactNode } from 'react'
import SideNav from './SideNav'
import TopBar from './TopBar'

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <TopBar />
      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6">
        <SideNav />
        <main className="w-full">{children}</main>
      </div>
    </div>
  )
}
