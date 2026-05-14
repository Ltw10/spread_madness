import { createClient } from '@supabase/supabase-js'

/** DB schema for all Spread Madness tables (isolates from other apps on the same Supabase project). */
export const SPREAD_MADNESS_SCHEMA = 'spread_madness'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      db: { schema: SPREAD_MADNESS_SCHEMA },
    })
  : null
