// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'

// --- Custom Hook for Dropdown Logic (DRY) ---
const useDropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = () => setIsOpen(prev => !prev);
  const close = () => setIsOpen(false);

  return { isOpen, toggle, close, ref, buttonRef };
};

// --- Helper Functions ---
function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

function initialsFrom(emailOrName: string) {
  const s = (emailOrName || '').trim()
  if (!s) return 'GC'
  const parts = s.replace(/[@._-]+/g, ' ').split(' ').map(x => x.trim()).filter(Boolean)
  return ((parts[0] || 'G')[0] + (parts[1] || parts[0] || 'C')[0]).toUpperCase()
}

const getTimeBasedColor = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', icon: '🌅', label: 'Morning' }
  if (hour < 18) return { gradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', icon: '☀️', label: 'Afternoon' }
  return { gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', icon: '🌙', label: 'Evening' }
}

// --- Sub-Components ---

const UserMenu = ({ user, dark, setDark, onLogout, loggingOut }: any) => {
  const dropdown = useDropdown();
  const timeBased = getTimeBasedColor();
  const avatar = initialsFrom(user.email || 'GastroChef');
  
  return (
    <div className="gc-user-menu relative">
      <button ref={dropdown.buttonRef} className="gc-user-btn" onClick={dropdown.toggle}>
        <div className="user-avatar" style={{ background: timeBased.gradient }}>{avatar}</div>
        <span className="user-name hidden md:inline">{user.email?.split('@')[0] || 'Account'}</span>
        <span className="user-chevron">▼</span>
      </button>
      
      {dropdown.isOpen && (
        <div ref={dropdown.ref} className="gc-dropdown user-dropdown">
           {/* Dropdown content simplified for brevity */}
           <div className="p-4 border-b border-gc-border flex items-center gap-3">
             <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ background: timeBased.gradient }}>{avatar}</div>
             <div>
               <div className="font-bold">{user.email}</div>
               <div className="text-xs text-gc-muted">{timeBased.label} {timeBased.icon}</div>
             </div>
           </div>
           <div className="p-2">
             <button className="dropdown-item w-full text-left px-3 py-2 hover:bg-gc-hover rounded" onClick={() => setDark(!dark)}>
               {dark ? '☀️ Light Mode' : '🌙 Dark Mode'}
             </button>
             <button className="dropdown-item w-full text-left px-3 py-2 hover:bg-gc-hover rounded text-red-500" onClick={onLogout} disabled={loggingOut}>
               🚪 {loggingOut ? 'Logging out...' : 'Log out'}
             </button>
           </div>
        </div>
      )}
    </div>
  )
}

const NotificationCenter = ({ notifications }: any) => {
  const dropdown = useDropdown();
  const unread = notifications.filter((n: any) => !n.read).length;

  return (
    <div className="relative">
       <button ref={dropdown.buttonRef} className="gc-action-btn relative" onClick={dropdown.toggle}>
         🔔
         {unread > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">{unread}</span>}
       </button>
       {dropdown.isOpen && (
         <div ref={dropdown.ref} className="gc-dropdown notifications-dropdown">
           <div className="p-3 border-b border-gc-border font-bold text-sm">Notifications</div>
           <div className="max-h-60 overflow-y-auto">
             {notifications.map((n: any) => (
               <div key={n.id} className="px-3 py-2 hover:bg-gc-hover cursor-pointer text-sm">
                 {n.message}
               </div>
             ))}
           </div>
         </div>
       )}
    </div>
  )
}

// --- Main Component ---
export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()
  const navigate = useNavigate()
  const loc = useLocation()
  
  // State
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark')
  const [focusMode, setFocusMode] = useState(() => localStorage.getItem('gc_focus_mode') === 'true')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [notifications, setNotifications] = useState([{ id: '1', type: 'info', message: 'Welcome!', read: false }])

  // Effects
  useEffect(() => { document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { document.body.classList.toggle('focus-mode', focusMode) }, [focusMode])
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)) }, [])

  // Handlers
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.assign('/login')
  }, [])

  // ... (Data fetching hooks can be extracted to custom hooks like useKitchenStats) ...

  const isPrintRoute = useMemo(() => loc.pathname.includes('print'), [loc.pathname])

  if (isPrintRoute) return <div className="gc-root"><Outlet /></div>

  return (
    <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
      <div className="gc-shell flex">
        
        {/* Sidebar */}
        {!focusMode && (
          <aside className="gc-side w-64 h-screen sticky top-0 border-r border-gc-border bg-gc-bg flex flex-col">
             <div className="p-4 border-b border-gc-border">
               <div className="text-xl font-bold">Gastro<span className="text-gc-brand">Chef</span></div>
             </div>
             
             <div className="p-4">
               <div className="gc-label mb-2">MODE</div>
               <div className="flex bg-gc-hover rounded-lg p-1">
                 <button className={cx("flex-1 p-1 rounded text-sm", isKitchen && "bg-white shadow")} onClick={() => setMode('kitchen')}>Kitchen</button>
                 <button className={cx("flex-1 p-1 rounded text-sm", isMgmt && "bg-white shadow")} onClick={() => setMode('mgmt')}>Mgmt</button>
               </div>
             </div>

             <nav className="flex-1 p-2">
               {['dashboard', 'ingredients', 'recipes', 'settings'].map(path => (
                 <NavLink key={path} to={`/${path}`} className={({ isActive }) => cx("block p-2 px-4 rounded hover:bg-gc-hover capitalize", isActive && "bg-gc-brand/10 text-gc-brand font-bold")}>
                   {path}
                 </NavLink>
               ))}
             </nav>

             <div className="p-4 border-t border-gc-border">
                <button onClick={handleLogout} className="w-full p-2 text-center text-red-500 hover:bg-red-50 rounded">Logout</button>
             </div>
          </aside>
        )}

        {/* Main Content Area */}
        <main className="gc-main flex-1 flex flex-col min-h-screen">
          
          {/* Top Bar */}
          <header className="gc-topbar sticky top-0 z-20 bg-gc-bg/80 backdrop-blur border-b border-gc-border flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-4">
              <span className="font-bold text-gc-muted">Active Kitchen: {k.kitchenName}</span>
              <div className={cx("w-2 h-2 rounded-full", a.status === 'saving' ? 'bg-yellow-500 animate-pulse' : 'bg-green-500')} title={a.status} />
            </div>

            <div className="flex items-center gap-2">
               <button onClick={() => setPaletteOpen(true)} className="p-2 hover:bg-gc-hover rounded text-xs font-mono bg-gc-hover/50">⌘K</button>
               <button onClick={() => setFocusMode(!focusMode)} className="p-2 hover:bg-gc-hover rounded">{focusMode ? 'Exit Focus' : 'Focus'}</button>
               <NotificationCenter notifications={notifications} />
               <UserMenu user={user} dark={dark} setDark={setDark} onLogout={handleLogout} loggingOut={false} />
            </div>
          </header>

          {/* Page Content */}
          <div className="gc-content flex-1 p-6 bg-gc-bg-secondary">
             <Outlet />
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={[]} />
      
      {/* Styles are moved to a global CSS file or styled-components ideally, but kept minimal here */}
      <style>{`
        .gc-root { --gc-bg: #fff; --gc-bg-secondary: #f8fafc; --gc-text: #1e293b; --gc-border: #e2e8f0; --gc-brand: #6B7F3B; --gc-hover: rgba(0,0,0,0.03); }
        .gc-dark.gc-root { --gc-bg: #111827; --gc-bg-secondary: #1f2937; --gc-text: #f1f5f9; --gc-border: #374151; --gc-hover: rgba(255,255,255,0.05); }
        .gc-side { transition: transform 0.3s; }
        .gc-dropdown { position: absolute; top: 100%; right: 0; margin-top: 8px; background: var(--gc-bg); border: 1px solid var(--gc-border); border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); min-width: 200px; z-index: 50; }
        .focus-mode .gc-side { display: none; }
      `}</style>
    </div>
  )
}
