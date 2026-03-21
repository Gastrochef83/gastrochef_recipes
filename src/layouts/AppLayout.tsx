## الملف الكامل: src/layouts/AppLayout.tsx

```tsx
// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'
import { motion } from 'framer-motion'

function cx(...arr: Array<string | false | null | undefined>) {
  return arr.filter(Boolean).join(' ')
}

function initialsFrom(emailOrName: string) {
  const s = (emailOrName || '').trim()
  if (!s) return 'GC'
  const parts = s
    .replace(/[@._-]+/g, ' ')
    .split(' ')
    .map((x) => x.trim())
    .filter(Boolean)
  const a = (parts[0] || 'G')[0]
  const b = (parts[1] || parts[0] || 'C')[0]
  return (a + b).toUpperCase()
}

function clearAppCaches() {
  try {
    localStorage.removeItem('gc-mode')
    localStorage.removeItem('gc_v5_cost_cache_v1')
    clearKitchenCache()
    sessionStorage.clear()
  } catch {}
}

function applyGlobalDensity(density: 'comfort' | 'cozy' | 'compact') {
  try {
    document.documentElement.setAttribute('data-density', density)
  } catch {}
}

function loadGlobalDensity(): 'comfort' | 'cozy' | 'compact' {
  try {
    const v = localStorage.getItem('gc_density')
    if (v === 'compact' || v === 'cozy' || v === 'comfort') return v
    const v2 = localStorage.getItem('gc_v5_density')
    if (v2 === 'dense') return 'compact'
    if (v2 === 'comfortable') return 'comfort'
  } catch {}
  return 'comfort'
}

const getTimeBasedColor = () => {
  const hour = new Date().getHours()
  if (hour < 12) return { 
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)', 
    icon: '🌅',
    label: 'Morning'
  }
  if (hour < 18) return { 
    gradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', 
    icon: '☀️',
    label: 'Afternoon'
  }
  return { 
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', 
    icon: '🌙',
    label: 'Evening'
  }
}

type Notification = {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  path?: string
  read: boolean
  timestamp: Date
}

export default function AppLayout() {
  const { isKitchen, isMgmt, setMode } = useMode()
  const k = useKitchen()
  const a = useAutosave()

  const navigate = useNavigate()
  const loc = useLocation()

  // Stats for quick display
  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [focusMode, setFocusMode] = useState(() => {
    try { return localStorage.getItem('gc_focus_mode') === 'true' } catch { return false }
  })
  const [showKitchenMenu, setShowKitchenMenu] = useState(false)
  const [kitchens, setKitchens] = useState<Array<{ id: string; name: string }>>([])
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [quickSearchResults, setQuickSearchResults] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])

  // Save focus mode preference
  useEffect(() => {
    try {
      localStorage.setItem('gc_focus_mode', String(focusMode))
      if (focusMode) {
        document.body.classList.add('focus-mode')
      } else {
        document.body.classList.remove('focus-mode')
      }
    } catch {}
  }, [focusMode])

  // Network status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Fetch quick stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!k.kitchenId) return
      try {
        const [{ count: recipes }, { count: ingredients }] = await Promise.all([
          supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('kitchen_id', k.kitchenId).eq('is_archived', false),
          supabase.from('ingredients').select('*', { count: 'exact', head: true }).eq('kitchen_id', k.kitchenId).eq('is_active', true)
        ])
        setRecipesCount(recipes || 0)
        setIngredientsCount(ingredients || 0)
      } catch { /* ignore */ }
    }
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [k.kitchenId])

  // Fetch available kitchens
  useEffect(() => {
    const fetchKitchens = async () => {
      try {
        const { data: user } = await supabase.auth.getUser()
        if (!user.user) return
        const { data } = await supabase
          .from('user_profiles')
          .select('kitchen_id, kitchens(name)')
          .eq('user_id', user.user.id)
        if (data) {
          setKitchens(data.map(p => ({ id: p.kitchen_id, name: (p as any).kitchens?.name || 'Unnamed Kitchen' })))
        }
      } catch { /* ignore */ }
    }
    fetchKitchens()
  }, [])

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', type: 'info', message: 'Welcome to GastroChef!', read: false, path: '/dashboard', timestamp: new Date() }
  ])

  // Recent items
  const [recentItems, setRecentItems] = useState<Array<{ 
    id: string; 
    name: string; 
    type: 'recipe' | 'ingredient'; 
    path: string;
    updated_at: string;
  }>>([])

  const [loadingRecent, setLoadingRecent] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showRecent, setShowRecent] = useState(false)
  
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const recentRef = useRef<HTMLDivElement>(null)
  const kitchenMenuRef = useRef<HTMLDivElement>(null)
  const userButtonRef = useRef<HTMLButtonElement>(null)
  const notificationsButtonRef = useRef<HTMLButtonElement>(null)
  const recentButtonRef = useRef<HTMLButtonElement>(null)
  const kitchenButtonRef = useRef<HTMLButtonElement>(null)
  const quickSearchRef = useRef<HTMLDivElement>(null)

  // Fetch recent items
  const fetchRecentItems = useCallback(async () => {
    if (!k.kitchenId) return
    try {
      setLoadingRecent(true)
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name, updated_at')
        .eq('kitchen_id', k.kitchenId)
        .order('updated_at', { ascending: false })
        .limit(5)
      
      const { data: ingredients } = await supabase
        .from('ingredients')
        .select('id, name, updated_at')
        .eq('kitchen_id', k.kitchenId)
        .order('updated_at', { ascending: false })
        .limit(5)
      
      const all: any[] = [
        ...(recipes?.map(r => ({ ...r, type: 'recipe', path: `/recipe?id=${r.id}` })) || []),
        ...(ingredients?.map(i => ({ ...i, type: 'ingredient', path: `/ingredients` })) || [])
      ]
      all.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setRecentItems(all.slice(0, 10))
    } catch { /* ignore */ }
    finally { setLoadingRecent(false) }
  }, [k.kitchenId])

  useEffect(() => {
    fetchRecentItems()
    const interval = setInterval(fetchRecentItems, 60000)
    return () => clearInterval(interval)
  }, [fetchRecentItems])

  // Quick search handler
  useEffect(() => {
    if (!quickSearchQuery.trim()) {
      setQuickSearchResults([])
      return
    }
    const search = async () => {
      const query = quickSearchQuery.toLowerCase()
      const [recipes, ingredients] = await Promise.all([
        supabase.from('recipes').select('id, name').eq('kitchen_id', k.kitchenId).ilike('name', `%${query}%`).limit(5),
        supabase.from('ingredients').select('id, name').eq('kitchen_id', k.kitchenId).ilike('name', `%${query}%`).limit(5)
      ])
      const results = [
        ...(recipes.data?.map(r => ({ ...r, type: 'recipe', path: `/recipe?id=${r.id}` })) || []),
        ...(ingredients.data?.map(i => ({ ...i, type: 'ingredient', path: `/ingredients` })) || [])
      ]
      setQuickSearchResults(results)
    }
    const timeout = setTimeout(search, 300)
    return () => clearTimeout(timeout)
  }, [quickSearchQuery, k.kitchenId])

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node) &&
          userButtonRef.current && !userButtonRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node) &&
          notificationsButtonRef.current && !notificationsButtonRef.current.contains(event.target as Node)) {
        setShowNotifications(false)
      }
      if (recentRef.current && !recentRef.current.contains(event.target as Node) &&
          recentButtonRef.current && !recentButtonRef.current.contains(event.target as Node)) {
        setShowRecent(false)
      }
      if (kitchenMenuRef.current && !kitchenMenuRef.current.contains(event.target as Node) &&
          kitchenButtonRef.current && !kitchenButtonRef.current.contains(event.target as Node)) {
        setShowKitchenMenu(false)
      }
      if (quickSearchRef.current && !quickSearchRef.current.contains(event.target as Node)) {
        setShowQuickSearch(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isPrintRoute = useMemo(() => {
    const path = (loc.pathname || '').toLowerCase()
    const hash = (loc.hash || '').toLowerCase()
    return path.includes('/print') || hash.includes('#/print') || hash.includes('/print')
  }, [loc.pathname, loc.hash])

  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('theme') === 'dark' } catch { return false }
  })
  const [loggingOut, setLoggingOut] = useState(false)
  const [userEmail, setUserEmail] = useState<string>('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    const d = loadGlobalDensity()
    applyGlobalDensity(d)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch {}
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  }, [dark])

  const [paletteOpen, setPaletteOpen] = useState(false)
  const [ingredientIndex, setIngredientIndex] = useState<Array<{ id: string; name: string; code?: string | null }>>([])
  const [recipeIndex, setRecipeIndex] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    let cancelled = false
    async function loadIndexes() {
      try {
        const { data } = await supabase.from('ingredients').select('id,name,code').order('name', { ascending: true }).limit(300)
        if (!cancelled && Array.isArray(data)) {
          setIngredientIndex(data.filter((x: any) => x && typeof x.name === 'string').map((x: any) => ({ id: String(x.id), name: String(x.name), code: x.code ?? null })))
        }
      } catch { /* ignore */ }
      try {
        const { data } = await supabase.from('recipes').select('id,name').order('name', { ascending: true }).limit(300)
        if (!cancelled && Array.isArray(data)) {
          setRecipeIndex(data.filter((x: any) => x && typeof x.name === 'string').map((x: any) => ({ id: String(x.id), name: String(x.name) })))
        }
      } catch { /* ignore */ }
    }
    loadIndexes()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const fn = () => setPaletteOpen(true)
    window.addEventListener('gc:open-command-palette', fn as any)
    return () => window.removeEventListener('gc:open-command-palette', fn as any)
  }, [])

  const base = (import.meta as any).env?.BASE_URL || '/'
  const brandLogo = `${base}gastrochef-logo.png`
  const brandFallback = `${base}gastrochef-icon-512.png`

  useEffect(() => {
    let alive = true
    async function loadUser() {
      try {
        const { data } = await supabase.auth.getUser()
        if (alive) setUserEmail(data?.user?.email || '')
      } catch { if (alive) setUserEmail('') }
    }
    loadUser()
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadUser())
    return () => { alive = false; sub?.subscription?.unsubscribe() }
  }, [])

  const handleLogout = useCallback(async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try { await supabase.auth.signOut() } catch { /* ignore */ }
    try { clearAppCaches(); setMode('mgmt') } finally { window.location.assign(`${base}#/login`) }
  }, [base, loggingOut, setMode])

  const handleQuickExport = useCallback(async () => {
    if (!k.kitchenId) return
    try {
      const { exportKitchenBackup } = await import('../lib/backupJson')
      const backup = await exportKitchenBackup(k.kitchenId, k.kitchenName || 'My Kitchen')
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `gastrochef_backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'success', message: 'Backup exported successfully!', read: false, timestamp: new Date(), path: '' }, ...prev].slice(0, 50))
    } catch (e: any) {
      setNotifications(prev => [{ id: `${Date.now()}`, type: 'error', message: `Export failed: ${e.message}`, read: false, timestamp: new Date(), path: '' }, ...prev].slice(0, 50))
    }
  }, [k.kitchenId, k.kitchenName])

  const commands: CommandItem[] = useMemo(() => {
    const cmds: CommandItem[] = [
      { id: 'go-dashboard', label: 'Go to Dashboard', kbd: 'G D', run: () => navigate('/dashboard') },
      { id: 'go-recipes', label: 'Go to Recipes', kbd: 'G R', run: () => navigate('/recipes') },
      { id: 'go-ingredients', label: 'Go to Ingredients', kbd: 'G I', run: () => navigate('/ingredients') },
      { id: 'go-recipe', label: 'Open Recipe Editor', kbd: 'G E', run: () => navigate('/recipe') },
      { id: 'go-cook', label: 'Open Cook Mode', kbd: 'G C', run: () => navigate('/cook') },
      { id: 'go-print', label: 'Open Print', kbd: 'G P', run: () => navigate('/print') },
      { id: 'go-settings', label: 'Go to Settings', kbd: 'G S', run: () => navigate('/settings') },
      { id: 'toggle-theme', label: dark ? 'Switch to Light Mode' : 'Switch to Dark Mode', kbd: 'T', run: () => setDark(v => !v) },
      { id: 'toggle-focus', label: focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode', kbd: 'F', run: () => setFocusMode(v => !v) },
      { id: 'refresh-kitchen', label: 'Refresh kitchen', kbd: 'R', run: async () => { await k.refresh().catch(() => {}) } },
      { id: 'export-backup', label: 'Export Backup', kbd: 'E', run: () => handleQuickExport() },
      { id: 'logout', label: 'Log out', kbd: 'L', danger: true, run: async () => { await handleLogout() } },
    ]
    ingredientIndex.forEach((ing) => {
      cmds.push({ id: `ing-${ing.id}`, label: `Ingredient: ${ing.name}${ing.code ? ` (${ing.code})` : ''}`, kbd: '⏎', run: () => navigate('/ingredients') })
    })
    recipeIndex.forEach((r) => {
      cmds.push({ id: `rec-${r.id}`, label: `Recipe: ${r.name}`, kbd: '⏎', run: () => navigate('/recipes') })
    })
    return cmds
  }, [navigate, dark, focusMode, k, handleLogout, handleQuickExport, ingredientIndex, recipeIndex])

  const avatarText = initialsFrom(userEmail || 'GastroChef')
  const kitchenLabel = k.kitchenName || (k.kitchenId ? 'Kitchen' : 'Resolving kitchen…')
  const timeBased = getTimeBasedColor()
  const unreadCount = notifications.filter(n => !n.read).length

  if (isPrintRoute) {
    return (
      <div className={cx('gc-root', dark && 'gc-dark', 'gc-print-route')}>
        <main className="gc-main" style={{ padding: 0 }}><Outlet /></main>
      </div>
    )
  }

  const styles = `
    /* ===== ENHANCED TOP BAR STYLES ===== */
    .gc-topbar-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 60px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(107, 127, 59, 0.2);
      padding: 0 20px;
      gap: 16px;
    }
    
    .gc-dark .gc-topbar-pill {
      background: rgba(20, 25, 35, 0.95);
      border-bottom: 1px solid rgba(107, 127, 59, 0.3);
    }
    
    /* Left Section */
    .gc-topbar-left {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }
    
    .gc-topbar-logo {
      height: 32px;
      width: auto;
    }
    
    /* Kitchen Selector */
    .gc-kitchen-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(107, 127, 59, 0.12);
      border: 1px solid rgba(107, 127, 59, 0.25);
      border-radius: 40px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-weight: 500;
      font-size: 13px;
      color: var(--gc-text);
    }
    
    .gc-kitchen-btn:hover {
      background: rgba(107, 127, 59, 0.2);
      border-color: rgba(107, 127, 59, 0.4);
      transform: translateY(-1px);
    }
    
    .kitchen-icon { font-size: 14px; }
    .kitchen-name { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .kitchen-chevron { font-size: 10px; opacity: 0.7; }
    
    /* Stats Badges */
    .gc-stats-group {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(0, 0, 0, 0.03);
      padding: 4px 12px;
      border-radius: 32px;
    }
    
    .gc-dark .gc-stats-group {
      background: rgba(255, 255, 255, 0.05);
    }
    
    .gc-stat-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      color: var(--gc-text);
    }
    
    .stat-icon { font-size: 14px; }
    .stat-value { font-weight: 700; color: var(--gc-brand-olive); }
    
    /* Connection Status */
    .gc-connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      transition: all 0.2s ease;
    }
    
    .status-dot.online { background: #10b981; box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2); }
    .status-dot.saving { background: #f59e0b; animation: pulse 1s infinite; }
    .status-dot.error { background: #ef4444; }
    .status-dot.offline { background: #6b7280; }
    
    .status-text {
      font-size: 11px;
      font-weight: 500;
      color: var(--gc-muted);
    }
    
    /* Right Section */
    .gc-topbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    
    /* Action Buttons */
    .gc-action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: transparent;
      border: 1px solid var(--gc-border);
      border-radius: 32px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 12px;
      font-weight: 500;
      color: var(--gc-text);
    }
    
    .gc-action-btn:hover {
      background: rgba(107, 127, 59, 0.1);
      border-color: rgba(107, 127, 59, 0.4);
      transform: translateY(-1px);
    }
    
    .gc-action-btn.active {
      background: rgba(107, 127, 59, 0.15);
      border-color: rgba(107, 127, 59, 0.5);
    }
    
    .btn-icon { font-size: 14px; }
    .btn-text { font-size: 12px; }
    
    /* Command Palette Button */
    .gc-cmdk-btn {
      background: rgba(107, 127, 59, 0.08);
      border-color: rgba(107, 127, 59, 0.3);
    }
    
    .cmd-key {
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
      background: rgba(0, 0, 0, 0.05);
      padding: 2px 5px;
      border-radius: 6px;
    }
    
    .gc-dark .cmd-key {
      background: rgba(255, 255, 255, 0.1);
    }
    
    /* Autosave Status */
    .gc-autosave-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 32px;
      font-size: 12px;
      font-weight: 500;
    }
    
    .gc-autosave-status.saving {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
    }
    
    .gc-autosave-status.saved {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
    }
    
    .gc-autosave-status.error {
      background: rgba(239, 68, 68, 0.12);
      color: #ef4444;
    }
    
    .gc-autosave-status.idle {
      background: transparent;
      color: var(--gc-muted);
    }
    
    /* Notifications Badge */
    .gc-action-btn.has-badge {
      position: relative;
    }
    
    .notification-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      background: #ef4444;
      color: white;
      font-size: 10px;
      font-weight: 700;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }
    
    /* Dropdown Menus */
    .gc-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 320px;
      background: var(--gc-bg-card);
      border: 1px solid var(--gc-border);
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      z-index: 1000;
      animation: slideDown 0.2s ease;
    }
    
    .gc-dark .gc-dropdown {
      background: #1f2937;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .dropdown-header {
      padding: 14px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--gc-muted);
      border-bottom: 1px solid var(--gc-border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .mark-read-btn {
      background: none;
      border: none;
      font-size: 11px;
      color: var(--gc-brand-olive);
      cursor: pointer;
    }
    
    .dropdown-list {
      max-height: 320px;
      overflow-y: auto;
    }
    
    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 16px;
      text-align: left;
      background: none;
      border: none;
      cursor: pointer;
      transition: background 0.15s ease;
      font-size: 13px;
      color: var(--gc-text);
    }
    
    .dropdown-item:hover {
      background: rgba(107, 127, 59, 0.08);
    }
    
    .dropdown-item.unread {
      background: rgba(107, 127, 59, 0.05);
    }
    
    .dropdown-item.danger {
      color: #ef4444;
    }
    
    .dropdown-item.danger:hover {
      background: rgba(239, 68, 68, 0.1);
    }
    
    .item-icon { font-size: 16px; width: 28px; }
    .item-info { flex: 1; }
    .item-name { font-weight: 600; margin-bottom: 2px; }
    .item-meta { font-size: 11px; color: var(--gc-muted); }
    
    .empty-state {
      padding: 40px;
      text-align: center;
      color: var(--gc-muted);
      font-size: 13px;
    }
    
    /* User Menu */
    .gc-user-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 12px 4px 4px;
      background: transparent;
      border: 1px solid var(--gc-border);
      border-radius: 40px;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    
    .gc-user-btn:hover {
      background: rgba(107, 127, 59, 0.08);
      border-color: rgba(107, 127, 59, 0.3);
    }
    
    .user-avatar {
      width: 32px;
      height: 32px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
      color: white;
    }
    
    .user-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--gc-text);
    }
    
    .user-chevron {
      font-size: 10px;
      color: var(--gc-muted);
    }
    
    .user-dropdown {
      width: 260px;
      right: 0;
      left: auto;
    }
    
    .user-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--gc-border);
    }
    
    .user-avatar-large {
      width: 48px;
      height: 48px;
      border-radius: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: white;
    }
    
    .user-info .user-name {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 2px;
    }
    
    .user-role {
      font-size: 11px;
      color: var(--gc-muted);
    }
    
    .user-time {
      font-size: 10px;
      color: var(--gc-muted);
      margin-top: 4px;
    }
    
    .dropdown-divider {
      height: 1px;
      background: var(--gc-border);
      margin: 6px 0;
    }
    
    /* Quick Search Dropdown */
    .gc-quick-search {
      position: relative;
    }
    
    .gc-quick-search-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 300px;
      background: var(--gc-bg-card);
      border: 1px solid var(--gc-border);
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);
      overflow: hidden;
      z-index: 1000;
    }
    
    .gc-quick-search-dropdown input {
      width: 100%;
      padding: 12px 16px;
      border: none;
      border-bottom: 1px solid var(--gc-border);
      background: transparent;
      font-size: 14px;
      color: var(--gc-text);
      outline: none;
    }
    
    .search-results {
      max-height: 280px;
      overflow-y: auto;
    }
    
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    
    .search-result-item:hover {
      background: rgba(107, 127, 59, 0.08);
    }
    
    /* Pulse Animation */
    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.2); }
    }
    
    /* Responsive */
    @media (max-width: 1024px) {
      .gc-topbar-pill { padding: 0 16px; gap: 12px; }
      .gc-stats-group { display: none; }
      .gc-autosave-status .autosave-text { display: none; }
      .gc-action-btn .btn-text { display: none; }
      .gc-action-btn { padding: 6px 10px; }
      .user-name { display: none; }
    }
    
    @media (max-width: 768px) {
      .gc-topbar-logo { display: none; }
      .gc-kitchen-btn .kitchen-name { max-width: 100px; }
      .gc-quick-search-dropdown { width: 280px; right: -40px; }
      .gc-dropdown { width: 280px; right: -20px; }
    }
  `

  return (
    <>
      <style>{styles}</style>
      
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt', focusMode && 'gc-focus-mode')}>
        <div className="gc-shell">
          {/* Mobile Menu Toggle */}
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 60,
              display: 'none',
              width: 44,
              height: 44,
              borderRadius: 22,
              background: 'linear-gradient(135deg, #6B7F3B 0%, #1F7A78 100%)',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <aside className={cx('gc-side', isSidebarOpen && 'is-open')}>
            <div className="gc-side-card">
              <div className="gc-brand">
                <div className="gc-brand-mark" aria-hidden="true">
                  <img
                    src={brandLogo}
                    alt=""
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                  />
                </div>
                <div>
                  <div className="gc-brand-name">
                    Gastro<span className="gc-brand-accent">Chef</span>
                  </div>
                  <div className="gc-brand-sub">{kitchenLabel}</div>
                </div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">MODE</div>
                <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')} role="tablist" aria-label="Mode">
                  <button
                    className={cx('gc-mode-seg', isKitchen && 'is-active')}
                    type="button"
                    onClick={() => setMode('kitchen')}
                  >
                    Kitchen
                  </button>
                  <button
                    className={cx('gc-mode-seg', isMgmt && 'is-active')}
                    type="button"
                    onClick={() => setMode('mgmt')}
                  >
                    Mgmt
                  </button>
                </div>
                <div className="gc-hint">{isKitchen ? 'Kitchen mode is active.' : 'Mgmt mode is active.'}</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">NAVIGATION</div>
                <nav className="gc-nav">
                  <NavLink to="/dashboard" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/ingredients" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Ingredients
                  </NavLink>
                  <NavLink to="/recipes" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Recipes
                  </NavLink>
                  <NavLink to="/settings" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>
                    Settings
                  </NavLink>
                </nav>
                <div className="gc-tip">Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <button
                  className="gc-btn gc-btn-danger gc-btn--full"
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                >
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          <main className="gc-main">
            {/* TOP BAR - ENHANCED */}
            <div className="gc-topbar" aria-label="Top bar">
              <div className="gc-topbar-pill">
                
                {/* LEFT SECTION */}
                <div className="gc-topbar-left">
                  <img
                    className="gc-topbar-logo"
                    src={brandLogo}
                    alt="GastroChef"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = brandFallback
                    }}
                  />
                  
                  {/* Kitchen Selector */}
                  <div className="gc-kitchen-selector">
                    <button 
                      ref={kitchenButtonRef}
                      className="gc-kitchen-btn"
                      onClick={() => setShowKitchenMenu(!showKitchenMenu)}
                    >
                      <span className="kitchen-icon">🏠</span>
                      <span className="kitchen-name">{kitchenLabel}</span>
                      <span className="kitchen-chevron">▼</span>
                    </button>
                    {showKitchenMenu && kitchens.length > 0 && (
                      <div ref={kitchenMenuRef} className="gc-dropdown" style={{ width: 240 }}>
                        <div className="dropdown-header">Switch Kitchen</div>
                        {kitchens.map(kit => (
                          <button key={kit.id} className="dropdown-item" onClick={() => { window.location.reload(); setShowKitchenMenu(false); }}>
                            <span>{kit.name}</span>
                            {kit.id === k.kitchenId && <span>✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Quick Stats Badges */}
                  <div className="gc-stats-group">
                    <div className="gc-stat-badge" title="Active Recipes">
                      <span className="stat-icon">📝</span>
                      <span className="stat-value">{recipesCount}</span>
                    </div>
                    <div className="gc-stat-badge" title="Active Ingredients">
                      <span className="stat-icon">🥗</span>
                      <span className="stat-value">{ingredientsCount}</span>
                    </div>
                  </div>

                  {/* Connection Status */}
                  <div className="gc-connection-status">
                    <div className={`status-dot ${!isOnline ? 'offline' : a.status === 'saving' ? 'saving' : a.status === 'error' ? 'error' : 'online'}`} />
                    {!isOnline && <span className="status-text">Offline</span>}
                  </div>
                </div>

                {/* CENTER SPACER */}
                <div className="gc-topbar-spacer" />

                {/* RIGHT SECTION */}
                <div className="gc-topbar-right">
                  
                  {/* Autosave Status */}
                  <div className={`gc-autosave-status ${a.status}`}>
                    <span className="autosave-icon">
                      {a.status === 'saving' && '⏳'}
                      {a.status === 'saved' && '✓'}
                      {a.status === 'error' && '⚠️'}
                      {a.status === 'idle' && '💾'}
                    </span>
                    <span className="autosave-text">
                      {a.status === 'saving' && 'Saving...'}
                      {a.status === 'saved' && 'Saved'}
                      {a.status === 'error' && 'Failed'}
                      {a.status === 'idle' && 'Auto-saved'}
                    </span>
                  </div>

                  {/* Export Button */}
                  <button className="gc-action-btn" onClick={handleQuickExport} title="Export Backup">
                    <span className="btn-icon">📦</span>
                    <span className="btn-text">Export</span>
                  </button>

                  {/* Focus Mode Toggle */}
                  <button className={`gc-action-btn ${focusMode ? 'active' : ''}`} onClick={() => setFocusMode(!focusMode)} title={focusMode ? 'Exit Focus Mode' : 'Enter Focus Mode'}>
                    <span className="btn-icon">{focusMode ? '🎯' : '🔍'}</span>
                    <span className="btn-text">Focus</span>
                  </button>

                  {/* Quick Search */}
                  <div className="gc-quick-search">
                    <button className="gc-action-btn" onClick={() => setShowQuickSearch(!showQuickSearch)} title="Quick Search">
                      <span className="btn-icon">🔍</span>
                    </button>
                    {showQuickSearch && (
                      <div className="gc-quick-search-dropdown" ref={quickSearchRef}>
                        <input
                          autoFocus
                          type="text"
                          placeholder="Search recipes or ingredients..."
                          value={quickSearchQuery}
                          onChange={(e) => setQuickSearchQuery(e.target.value)}
                          onBlur={() => setTimeout(() => setShowQuickSearch(false), 200)}
                        />
                        {quickSearchResults.length > 0 && (
                          <div className="search-results">
                            {quickSearchResults.map(r => (
                              <div key={r.id} className="search-result-item" onClick={() => { navigate(r.path); setShowQuickSearch(false); setQuickSearchQuery(''); }}>
                                <span>{r.type === 'recipe' ? '📝' : '🥗'}</span>
                                <span>{r.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Command Palette */}
                  <button className="gc-action-btn gc-cmdk-btn" onClick={() => setPaletteOpen(true)} title="Command Palette (⌘K)">
                    <span className="cmd-key">⌘</span>
                    <span className="cmd-key">K</span>
                  </button>

                  {/* Notifications */}
                  <div className="gc-notifications">
                    <button 
                      ref={notificationsButtonRef}
                      className={`gc-action-btn ${unreadCount > 0 ? 'has-badge' : ''}`} 
                      onClick={() => setShowNotifications(!showNotifications)}
                    >
                      <span className="btn-icon">🔔</span>
                      {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                    </button>
                    {showNotifications && (
                      <div ref={notificationsRef} className="gc-dropdown notifications-dropdown">
                        <div className="dropdown-header">
                          <span>Notifications</span>
                          {unreadCount > 0 && (
                            <button className="mark-read-btn" onClick={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}>
                              Mark all read
                            </button>
                          )}
                        </div>
                        <div className="dropdown-list">
                          {notifications.length > 0 ? (
                            notifications.map(n => (
                              <button key={n.id} className={`dropdown-item ${!n.read ? 'unread' : ''}`} onClick={() => { 
                                setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)); 
                                if (n.path) navigate(n.path); 
                                setShowNotifications(false); 
                              }}>
                                <span className="item-icon">
                                  {n.type === 'success' ? '✓' : n.type === 'error' ? '✗' : n.type === 'warning' ? '⚠' : 'ℹ'}
                                </span>
                                <span className="item-message">{n.message}</span>
                              </button>
                            ))
                          ) : (
                            <div className="empty-state">No notifications</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Recent Items */}
                  <div className="gc-recent">
                    <button 
                      ref={recentButtonRef}
                      className="gc-action-btn" 
                      onClick={() => setShowRecent(!showRecent)} 
                      disabled={loadingRecent}
                    >
                      <span className="btn-icon">{loadingRecent ? '⏳' : '🕒'}</span>
                    </button>
                    {showRecent && (
                      <div ref={recentRef} className="gc-dropdown recent-dropdown">
                        <div className="dropdown-header">Recently Updated</div>
                        <div className="dropdown-list">
                          {recentItems.length > 0 ? (
                            recentItems.map((item, idx) => (
                              <button key={`${item.id}-${idx}`} className="dropdown-item" onClick={() => { navigate(item.path); setShowRecent(false); }}>
                                <span className="item-icon">{item.type === 'recipe' ? '📝' : '🥗'}</span>
                                <div className="item-info">
                                  <div className="item-name">{item.name}</div>
                                  <div className="item-meta">{item.type === 'recipe' ? 'Recipe' : 'Ingredient'} • {new Date(item.updated_at).toLocaleDateString()}</div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="empty-state">No recent items</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* User Menu */}
                  <div className="gc-user-menu">
                    <button 
                      ref={userButtonRef}
                      className="gc-user-btn" 
                      onClick={() => setShowUserMenu(!showUserMenu)}
                    >
                      <div className="user-avatar" style={{ background: timeBased.gradient }}>
                        {avatarText}
                      </div>
                      <span className="user-name">{userEmail ? userEmail.split('@')[0] : 'Account'}</span>
                      <span className="user-chevron">▼</span>
                    </button>
                    {showUserMenu && (
                      <div ref={userMenuRef} className="gc-dropdown user-dropdown">
                        <div className="user-header">
                          <div className="user-avatar-large" style={{ background: timeBased.gradient }}>{avatarText}</div>
                          <div className="user-info">
                            <div className="user-name">{userEmail ? userEmail.split('@')[0] : 'Account'}</div>
                            <div className="user-role">{k.profile?.role === 'owner' ? 'Owner' : k.profile?.role === 'staff' ? 'Staff' : 'Viewer'}</div>
                            <div className="user-time">{timeBased.label} {timeBased.icon}</div>
                          </div>
                        </div>
                        <div className="dropdown-divider" />
                        <button className="dropdown-item" onClick={() => { setDark(!dark); setShowUserMenu(false); }}>
                          <span className="item-icon">{dark ? '☀️' : '🌙'}</span>
                          <span>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                        </button>
                        <button className="dropdown-item" onClick={() => { setFocusMode(!focusMode); setShowUserMenu(false); }}>
                          <span className="item-icon">{focusMode ? '🎯' : '🔍'}</span>
                          <span>{focusMode ? 'Exit Focus Mode' : 'Focus Mode'}</span>
                        </button>
                        <div className="dropdown-divider" />
                        <button className="dropdown-item" onClick={async () => { await k.refresh(); setShowUserMenu(false); }}>
                          <span className="item-icon">🔄</span>
                          <span>Refresh Kitchen</span>
                        </button>
                        <button className="dropdown-item" onClick={() => { navigate('/settings'); setShowUserMenu(false); }}>
                          <span className="item-icon">⚙️</span>
                          <span>Settings</span>
                        </button>
                        <button className="dropdown-item" onClick={handleQuickExport}>
                          <span className="item-icon">📦</span>
                          <span>Export Backup</span>
                        </button>
                        <div className="dropdown-divider" />
                        <button className="dropdown-item danger" onClick={handleLogout} disabled={loggingOut}>
                          <span className="item-icon">🚪</span>
                          <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} items={commands} />

            <div className="gc-content">
              <div className="gc-page">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .gc-mobile-menu-toggle {
            display: flex !important;
          }
          .gc-side {
            transform: translateX(-100%);
            transition: transform 0.3s ease;
            position: fixed;
            z-index: 1000;
          }
          .gc-side.is-open {
            transform: translateX(0);
          }
          .gc-main {
            margin-left: 0 !important;
          }
        }
        
        .gc-focus-mode .gc-side {
          display: none !important;
        }
        
        .gc-focus-mode .gc-main {
          margin-left: 0 !important;
          max-width: 1200px;
          margin: 0 auto;
        }
      `}</style>
    </>
  )
}
```

---

**هذا هو الملف الكامل. قومي باستبدال محتوى ملفك الحالي بهذا الكود.**
