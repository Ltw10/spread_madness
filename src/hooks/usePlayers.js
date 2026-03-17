import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function usePlayers() {
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('sm_players').select('*').order('name')
      if (e) throw e
      setPlayers(data || [])
    } catch (err) {
      setError(err.message)
      setPlayers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!supabase) return
    const sub = supabase.channel('players').on('postgres_changes', { event: '*', schema: 'public', table: 'sm_players' }, load).subscribe()
    return () => { sub.unsubscribe() }
  }, [])

  async function addPlayer(name, color = '#6366f1', avatar_emoji = '🏀') {
    if (!supabase) throw new Error('Supabase not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
    const { data, error: e } = await supabase.from('sm_players').insert({ name, color, avatar_emoji }).select().single()
    if (e) throw e
    setPlayers((prev) => [...prev.filter((p) => p.id !== data.id), data].sort((a, b) => (a.name || '').localeCompare(b.name)))
    return data
  }

  async function updatePlayer(id, updates) {
    if (!supabase) return
    const { data, error: e } = await supabase.from('sm_players').update(updates).eq('id', id).select().single()
    if (e) throw e
    setPlayers((prev) => prev.map((p) => (p.id === id ? data : p)))
    return data
  }

  async function removePlayer(id) {
    if (!supabase) return
    await supabase.from('sm_players').delete().eq('id', id)
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  return { players, loading, error, reload: load, addPlayer, updatePlayer, removePlayer }
}
