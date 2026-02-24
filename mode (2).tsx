import { createClient } from '@supabase/supabase-js'

/**
 * ✅ FINAL GOD — Supabase client hardening (no business-logic change)
 * - Better HashRouter compatibility (detectSessionInUrl: false)
 * - Stable session persistence + token refresh
 * - Clear error if env vars are missing (prevents silent blank screens)
 */

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loudly (Vercel logs + ErrorBoundary) instead of a silent crash later
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // ✅ Important with HashRouter + manual redirects (#/login, #/dashboard)
    detectSessionInUrl: false,
  },
})
