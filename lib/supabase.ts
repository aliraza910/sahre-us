import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'

function getValidKey(key?: string): string {
  if (!key || key.includes('your-') || key.includes('-here') || key.includes('placeholder')) {
    return ''
  }
  return key
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = getValidKey(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) || getValidKey(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const supabaseServiceKey = getValidKey(process.env.SUPABASE_SERVICE_ROLE_KEY) || supabaseAnonKey

// ─── Browser / Client-side client ────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: { eventsPerSecond: 100 },
  },
})

// ─── Server-side admin client (service role) ─────────────────────
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Server component client (cookie-based) ──────────────────────
export async function createServerSupabaseClient() {
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Server component — ignore
        }
      },
    },
  })
}

// ─── Types ───────────────────────────────────────────────────────
export type Room = {
  id: string
  short_code: string
  host_peer_id: string | null
  password_hash: string | null
  expires_at: string
  created_at: string
}

export type Share = {
  id: string
  room_id: string | null
  file_name: string
  file_size: number
  storage_path: string
  password_hash: string | null
  expires_at: string
  download_count: number
  created_at: string
}
