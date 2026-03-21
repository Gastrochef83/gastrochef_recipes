// src/layouts/AppLayout.tsx
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useMode } from '../lib/mode'
import { supabase } from '../lib/supabase'
import { useKitchen, clearKitchenCache } from '../lib/kitchen'
import { useAutosave } from '../contexts/AutosaveContext'
import CommandPalette, { type CommandItem } from '../components/CommandPalette'

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

  const [recipesCount, setRecipesCount] = useState(0)
  const [ingredientsCount, setIngredientsCount] = useState(0)
  const [totalRecipesCount, setTotalRecipesCount] = useState(0)
  const [totalIngredientsCount, setTotalIngredientsCount] = useState(0)
  const [archivedRecipesCount, setArchivedRecipesCount] = useState(0)
  const [archivedIngredientsCount, setArchivedIngredientsCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [showKitchenMenu, setShowKitchenMenu] = useState(false)
  const [kitchens, setKitchens] = useState<Array<{ id: string; name: string }>>([])
  const [quickSearchQuery, setQuickSearchQuery] = useState('')
  const [showQuickSearch, setShowQuickSearch] = useState(false)
  const [quickSearchResults, setQuickSearchResults] = useState<Array<{ id: string; name: string; type: string; path: string }>>([])
  const [statsLoading, setStatsLoading] = useState(false)

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

  // Fetch all kitchen statistics
  const fetchStats = useCallback(async () => {
    if (!k.kitchenId) return
    
    setStatsLoading(true)
    try {
      // Get all recipes (including archived)
      const { count: allRecipes, error: allRecipesError } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
      
      if (!allRecipesError) {
        setTotalRecipesCount(allRecipes || 0)
      }

      // Get active recipes (not archived)
      const { count: activeRecipes, error: activeRecipesError } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_archived', false)
      
      if (!activeRecipesError) {
        setRecipesCount(activeRecipes || 0)
      }

      // Get archived recipes
      const { count: archivedRecipes, error: archivedRecipesError } = await supabase
        .from('recipes')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_archived', true)
      
      if (!archivedRecipesError) {
        setArchivedRecipesCount(archivedRecipes || 0)
      }
      
      // Get all ingredients (including inactive)
      const { count: allIngredients, error: allIngredientsError } = await supabase
        .from('ingredients')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
      
      if (!allIngredientsError) {
        setTotalIngredientsCount(allIngredients || 0)
      }
      
      // Get active ingredients only
      const { count: activeIngredients, error: activeIngredientsError } = await supabase
        .from('ingredients')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_active', true)
      
      if (!activeIngredientsError) {
        setIngredientsCount(activeIngredients || 0)
      }

      // Get archived/inactive ingredients
      const { count: archivedIngredients, error: archivedIngredientsError } = await supabase
        .from('ingredients')
        .select('*', { count: 'exact', head: true })
        .eq('kitchen_id', k.kitchenId)
        .eq('is_active', false)
      
      if (!archivedIngredientsError) {
        setArchivedIngredientsCount(archivedIngredients || 0)
      }
      
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setStatsLoading(false)
    }
  }, [k.kitchenId])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

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

  const [notifications, setNotifications] = useState<Notification[]>([
    { id: '1', type: 'info', message: 'Welcome to GastroChef!', read: false, path: '/dashboard', timestamp: new Date() }
  ])

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
  }, [navigate, dark, k, handleLogout, handleQuickExport, ingredientIndex, recipeIndex])

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
    .gc-topbar-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
      background: #ffffff;
      border-bottom: 1px solid #e5e7eb;
      padding: 0 24px;
      gap: 20px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    }
    
    .gc-dark .gc-topbar-pill {
      background: #1f2937;
      border-bottom: 1px solid #374151;
    }
    
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
    
    .gc-kitchen-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 13px;
      font-weight: 500;
      color: #1f2937;
    }
    
    .gc-dark .gc-kitchen-btn {
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
      border-color: #4b5563;
      color: #f3f4f6;
    }
    
    .gc-kitchen-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border-color: #10b981;
    }
    
    .gc-stats-group {
      display: flex;
      align-items: center;
      gap: 12px;
      background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
      padding: 6px 16px;
      border-radius: 40px;
      border: 1px solid #e5e7eb;
    }
    
    .gc-dark .gc-stats-group {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
      border-color: #374151;
    }
    
    .gc-stat-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #4b5563;
      padding: 4px 8px;
      border-radius: 8px;
      transition: all 0.2s ease;
    }
    
    .gc-stat-badge:hover {
      background: rgba(16, 185, 129, 0.1);
    }
    
    .gc-dark .gc-stat-badge {
      color: #9ca3af;
    }
    
    .stat-icon { 
      font-size: 16px; 
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.1));
    }
    
    .stat-value { 
      font-weight: 700; 
      color: #10b981;
      font-size: 16px;
      letter-spacing: -0.3px;
    }
    
    .stat-label {
      font-size: 11px;
      color: #6b7280;
      margin-left: 4px;
    }
    
    .gc-connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      background: #f9fafb;
      border-radius: 20px;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      transition: all 0.2s ease;
    }
    
    .status-dot.online { 
      background: #10b981; 
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
      animation: glow 2s ease-in-out infinite;
    }
    
    .status-dot.saving { 
      background: #f59e0b; 
      animation: pulse 1s ease-in-out infinite;
    }
    
    .status-dot.error { 
      background: #ef4444;
      animation: shake 0.5s ease;
    }
    
    .status-dot.offline { 
      background: #6b7280;
    }
    
    @keyframes glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
      50% { box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2); }
    }
    
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-2px); }
      75% { transform: translateX(2px); }
    }
    
    .status-text { 
      font-size: 11px; 
      font-weight: 500; 
      color: #6b7280;
    }
    
    .gc-topbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    
    .gc-action-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 12px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 12px;
      font-weight: 500;
      color: #374151;
    }
    
    .gc-dark .gc-action-btn {
      background: #374151;
      border-color: #4b5563;
      color: #e5e7eb;
    }
    
    .gc-action-btn:hover {
      background: #e5e7eb;
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-color: #10b981;
    }
    
    .gc-action-btn.active {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-color: #10b981;
      color: white;
    }
    
    .gc-cmdk-btn {
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      font-family: monospace;
      font-weight: 700;
    }
    
    .gc-dark .gc-cmdk-btn {
      background: linear-gradient(135deg, #4b5563 0%, #374151 100%);
    }
    
    .cmd-key {
      font-family: monospace;
      font-size: 11px;
      font-weight: 700;
      background: rgba(0, 0, 0, 0.1);
      padding: 2px 6px;
      border-radius: 6px;
      letter-spacing: 0.5px;
    }
    
    .gc-autosave-status {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    
    .gc-autosave-status.saving { 
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      color: #d97706;
      animation: pulse 1s ease-in-out infinite;
    }
    
    .gc-autosave-status.saved { 
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      color: #059669;
    }
    
    .gc-autosave-status.error { 
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      color: #dc2626;
    }
    
    .gc-autosave-status.idle { 
      background: #f3f4f6;
      color: #6b7280;
    }
    
    .gc-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      min-width: 280px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.02);
      overflow: hidden;
      z-index: 1000;
      animation: slideDown 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .gc-dark .gc-dropdown {
      background: #1f2937;
      border-color: #374151;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
    }
    
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    
    .dropdown-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      border-bottom: 1px solid #f3f4f6;
      background: #f9fafb;
    }
    
    .gc-dark .dropdown-header {
      color: #9ca3af;
      border-bottom-color: #374151;
      background: #111827;
    }
    
    .mark-read-btn {
      font-size: 10px;
      background: none;
      border: none;
      color: #10b981;
      cursor: pointer;
      font-weight: 600;
    }
    
    .dropdown-list {
      max-height: 360px;
      overflow-y: auto;
    }
    
    .dropdown-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 16px;
      text-align: left;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 13px;
      color: #1f2937;
    }
    
    .gc-dark .dropdown-item {
      color: #e5e7eb;
    }
    
    .dropdown-item:hover {
      background: #f3f4f6;
      transform: translateX(2px);
    }
    
    .gc-dark .dropdown-item:hover {
      background: #374151;
    }
    
    .dropdown-item.unread {
      background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
      border-left: 3px solid #3b82f6;
    }
    
    .gc-dark .dropdown-item.unread {
      background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
    }
    
    .dropdown-item.danger {
      color: #ef4444;
    }
    
    .dropdown-item.danger:hover {
      background: #fee2e2;
    }
    
    .item-icon { 
      font-size: 16px; 
      width: 28px;
      text-align: center;
    }
    
    .item-info { 
      flex: 1; 
    }
    
    .item-name { 
      font-weight: 600; 
      margin-bottom: 2px;
    }
    
    .item-meta { 
      font-size: 10px; 
      color: #6b7280;
    }
    
    .item-message {
      flex: 1;
    }
    
    .empty-state {
      padding: 40px;
      text-align: center;
      color: #6b7280;
      font-size: 13px;
    }
    
    .gc-user-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 12px 6px 8px;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      border: 1px solid #e5e7eb;
      border-radius: 40px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    
    .gc-dark .gc-user-btn {
      background: linear-gradient(135deg, #374151 0%, #1f2937 100%);
      border-color: #4b5563;
    }
    
    .gc-user-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      border-color: #10b981;
    }
    
    .user-avatar {
      width: 30px;
      height: 30px;
      border-radius: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 12px;
      color: white;
      transition: transform 0.2s ease;
    }
    
    .gc-user-btn:hover .user-avatar {
      transform: scale(1.05);
    }
    
    .user-name {
      font-size: 12px;
      font-weight: 500;
      color: #1f2937;
    }
    
    .gc-dark .user-name {
      color: #e5e7eb;
    }
    
    .user-chevron {
      font-size: 10px;
      color: #6b7280;
    }
    
    .user-dropdown {
      width: 280px;
    }
    
    .user-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 20px;
      border-bottom: 1px solid #f3f4f6;
    }
    
    .gc-dark .user-header {
      border-bottom-color: #374151;
    }
    
    .user-avatar-large {
      width: 48px;
      height: 48px;
      border-radius: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 18px;
      color: white;
    }
    
    .user-info .user-name {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    
    .user-role {
      font-size: 10px;
      color: #6b7280;
      font-weight: 500;
    }
    
    .user-time {
      font-size: 10px;
      color: #6b7280;
      margin-top: 6px;
    }
    
    .dropdown-divider {
      height: 1px;
      background: #f3f4f6;
      margin: 8px 0;
    }
    
    .gc-dark .dropdown-divider {
      background: #374151;
    }
    
    .gc-quick-search {
      position: relative;
    }
    
    .gc-quick-search-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 300px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      overflow: hidden;
      z-index: 1000;
    }
    
    .gc-dark .gc-quick-search-dropdown {
      background: #1f2937;
      border-color: #374151;
    }
    
    .gc-quick-search-dropdown input {
      width: 100%;
      padding: 14px 16px;
      border: none;
      border-bottom: 1px solid #f3f4f6;
      background: transparent;
      font-size: 13px;
      outline: none;
    }
    
    .gc-dark .gc-quick-search-dropdown input {
      border-bottom-color: #374151;
      color: #e5e7eb;
    }
    
    .gc-quick-search-dropdown input::placeholder {
      color: #9ca3af;
    }
    
    .search-results {
      max-height: 320px;
      overflow-y: auto;
    }
    
    .search-result-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-size: 13px;
    }
    
    .search-result-item:hover {
      background: #f3f4f6;
      transform: translateX(2px);
    }
    
    .gc-dark .search-result-item:hover {
      background: #374151;
    }
    
    .gc-action-btn.has-badge {
      position: relative;
    }
    
    .notification-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      font-size: 10px;
      font-weight: 700;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      animation: bounce 0.3s ease;
    }
    
    @keyframes bounce {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    
    .stats-loading {
      animation: pulse 1s ease-in-out infinite;
    }
    
    @media (max-width: 1024px) {
      .gc-topbar-pill { padding: 0 16px; gap: 12px; }
      .gc-stats-group { display: none; }
      .gc-autosave-status .autosave-text { display: none; }
      .gc-action-btn .btn-text { display: none; }
      .gc-action-btn { padding: 8px 10px; }
      .user-name { display: none; }
    }
    
    @media (max-width: 768px) {
      .gc-topbar-logo { display: none; }
      .gc-kitchen-btn .kitchen-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }
      .gc-quick-search-dropdown { width: 280px; right: -20px; }
      .gc-dropdown { width: 280px; right: -10px; }
      .gc-connection-status { display: none; }
    }
  `

  return (
    <>
      <style>{styles}</style>
      
      <div className={cx('gc-root', dark && 'gc-dark', isKitchen ? 'gc-kitchen' : 'gc-mgmt')}>
        <div className="gc-shell">
          <button
            className="gc-mobile-menu-toggle"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            style={{
              position: 'fixed',
              bottom: 20,
              right: 20,
              zIndex: 60,
              display: 'none',
              width: 48,
              height: 48,
              borderRadius: 24,
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 0.2s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
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
                <div className="gc-brand-mark">
                  <img src={brandLogo} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} />
                </div>
                <div>
                  <div className="gc-brand-name">Gastro<span className="gc-brand-accent">Chef</span></div>
                  <div className="gc-brand-sub">{kitchenLabel}</div>
                </div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">Mode</div>
                <div className={cx('gc-mode-switch', isKitchen ? 'is-kitchen' : 'is-mgmt')}>
                  <button className={cx('gc-mode-seg', isKitchen && 'is-active')} onClick={() => setMode('kitchen')}>Kitchen</button>
                  <button className={cx('gc-mode-seg', isMgmt && 'is-active')} onClick={() => setMode('mgmt')}>Mgmt</button>
                </div>
                <div className="gc-hint">{isKitchen ? 'Kitchen mode active.' : 'Mgmt mode active.'}</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <div className="gc-label">Navigation</div>
                <nav className="gc-nav">
                  <NavLink to="/dashboard" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Dashboard</NavLink>
                  <NavLink to="/ingredients" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Ingredients</NavLink>
                  <NavLink to="/recipes" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Recipes</NavLink>
                  <NavLink to="/settings" className={({ isActive }) => cx('gc-nav-item', isActive && 'is-active')}>Settings</NavLink>
                </nav>
                <div className="gc-tip">💡 Tip: Kitchen for cooking · Mgmt for costing & pricing.</div>
              </div>

              <div className="gc-side-block" style={{ marginTop: 14 }}>
                <button className="gc-btn gc-btn-danger gc-btn--full" onClick={handleLogout} disabled={loggingOut}>
                  {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
              </div>
            </div>
          </aside>

          <main className="gc-main">
            <div className="gc-topbar">
              <div className="gc-topbar-pill">
                <div className="gc-topbar-left">
                  <img className="gc-topbar-logo" src={brandLogo} alt="GastroChef" onError={(e) => { (e.currentTarget as HTMLImageElement).src = brandFallback }} />
                  
                  <div className="gc-kitchen-selector">
                    <button ref={kitchenButtonRef} className="gc-kitchen-btn" onClick={() => setShowKitchenMenu(!showKitchenMenu)}>
                      <span className="kitchen-icon">🏠</span>
                      <span className="kitchen-name">{kitchenLabel}</span>
                      <span className="kitchen-chevron">▼</span>
                    </button>
                    {showKitchenMenu && kitchens.length > 0 && (
                      <div ref={kitchenMenuRef} className="gc-dropdown" style={{ width: 260 }}>
                        <div className="dropdown-header">Switch Kitchen</div>
                        {kitchens.map(kit => (
                          <button key={kit.id} className="dropdown-item" onClick={() => { window.location.reload(); setShowKitchenMenu(false); }}>
                            <span className="item-icon">🏠</span>
                            <span className="item-info">{kit.name}</span>
                            {kit.id === k.kitchenId && <span className="stat-value">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="gc-stats-group">
                    <div className="gc-stat-badge" title="Active Recipes">
                      <span className="stat-icon">📝</span>
                      <span className="stat-value">{statsLoading ? '...' : recipesCount}</span>
                      {totalRecipesCount > recipesCount && (
                        <span className="stat-label">+{archivedRecipesCount} archived</span>
                      )}
                    </div>
                    <div className="gc-stat-divider" style={{ width: 1, height: 20, background: '#e5e7eb' }} />
                    <div className="gc-stat-badge" title="Active Ingredients">
                      <span className="stat-icon">🥗</span>
                      <span className="stat-value">{statsLoading ? '...' : ingredientsCount}</span>
                      {totalIngredientsCount > ingredientsCount && (
                        <span className="stat-label">+{archivedIngredientsCount} inactive</span>
                      )}
                    </div>
                  </div>

                  <div className="gc-connection-status">
                    <div className={`status-dot ${!isOnline ? 'offline' : a.status === 'saving' ? 'saving' : a.status === 'error' ? 'error' : 'online'}`} />
                    {!isOnline && <span className="status-text">Offline</span>}
                    {isOnline && a.status === 'saving' && <span className="status-text">Syncing...</span>}
                  </div>
                </div>

                <div className="gc-topbar-spacer" style={{ flex: 1 }} />

                <div className="gc-topbar-right">
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

                  <button className="gc-action-btn" onClick={handleQuickExport} title="Export Backup">
                    <span className="btn-icon">📦</span>
                    <span className="btn-text">Export</span>
                  </button>

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
                                <span style={{ flex: 1 }}>{r.name}</span>
                                <span style={{ fontSize: 10, color: '#6b7280' }}>{r.type === 'recipe' ? 'Recipe' : 'Ingredient'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {quickSearchQuery && quickSearchResults.length === 0 && (
                          <div className="empty-state">No results found</div>
                        )}
                      </div>
                    )}
                  </div>

                  <button className="gc-action-btn gc-cmdk-btn" onClick={() => setPaletteOpen(true)} title="Command Palette (⌘K)">
                    <span className="cmd-key">⌘</span>
                    <span className="cmd-key">K</span>
                  </button>

                  <div className="gc-notifications">
                    <button ref={notificationsButtonRef} className={`gc-action-btn ${unreadCount > 0 ? 'has-badge' : ''}`} onClick={() => setShowNotifications(!showNotifications)} title="Notifications">
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
                            notifications.slice(0, 10).map(n => (
                              <button key={n.id} className={`dropdown-item ${!n.read ? 'unread' : ''}`} onClick={() => { 
                                setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, read: true } : notif)); 
                                if (n.path) navigate(n.path); 
                                setShowNotifications(false); 
                              }}>
                                <span className="item-icon">
                                  {n.type === 'success' ? '✓' : n.type === 'error' ? '✗' : n.type === 'warning' ? '⚠' : 'ℹ'}
                                </span>
                                <span className="item-message">{n.message}</span>
                                <span className="item-meta" style={{ fontSize: 9 }}>
                                  {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="empty-state">✨ No notifications</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="gc-recent">
                    <button ref={recentButtonRef} className="gc-action-btn" onClick={() => setShowRecent(!showRecent)} disabled={loadingRecent} title="Recent Items">
                      <span className="btn-icon">{loadingRecent ? '⏳' : '🕒'}</span>
                    </button>
                    {showRecent && (
                      <div ref={recentRef} className="gc-dropdown recent-dropdown">
                        <div className="dropdown-header">Recently Updated</div>
                        <div className="dropdown-list">
                          {recentItems.length > 0 ? (
                            recentItems.slice(0, 8).map((item, idx) => (
                              <button key={`${item.id}-${idx}`} className="dropdown-item" onClick={() => { navigate(item.path); setShowRecent(false); }}>
                                <span className="item-icon">{item.type === 'recipe' ? '📝' : '🥗'}</span>
                                <div className="item-info">
                                  <div className="item-name">{item.name}</div>
                                  <div className="item-meta">{item.type === 'recipe' ? 'Recipe' : 'Ingredient'} • {new Date(item.updated_at).toLocaleDateString()}</div>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="empty-state">📭 No recent items</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="gc-user-menu">
                    <button ref={userButtonRef} className="gc-user-btn" onClick={() => setShowUserMenu(!showUserMenu)}>
                      <div className="user-avatar" style={{ background: timeBased.gradient }}>{avatarText}</div>
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
                        <div className="dropdown-divider" />
                        <button className="dropdown-item" onClick={async () => { await k.refresh(); fetchStats(); setShowUserMenu(false); }}>
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
          .gc-mobile-menu-toggle { display: flex !important; }
          .gc-side { 
            transform: translateX(-100%); 
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); 
            position: fixed; 
            z-index: 1000; 
            top: 0;
            left: 0;
            height: 100vh;
          }
          .gc-side.is-open { transform: translateX(0); }
          .gc-main { margin-left: 0 !important; }
        }
      `}</style>
    </>
  )
}
