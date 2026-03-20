import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchSmGamesWithTeams } from '../lib/gameFinalize'

export function useGames() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    if (!supabase) {
      console.log('[bracket] useGames load: no supabase, skipping')
      setLoading(false)
      return
    }
    console.log('[bracket] useGames load: fetching sm_games...')
    setLoading(true)
    setError(null)
    try {
      const list = await fetchSmGamesWithTeams(supabase)
      console.log('[bracket] useGames load: ok, games count =', list.length)
      setGames(list)
    } catch (err) {
      console.error('[bracket] useGames load: failed', err?.message ?? err)
      setError(err.message)
      setGames([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!supabase) return
    const sub = supabase.channel('games').on('postgres_changes', { event: '*', schema: 'public', table: 'sm_games' }, load).subscribe()
    return () => { sub.unsubscribe() }
  }, [])

  async function updateGame(id, updates) {
    if (!supabase) return
    const { error: e } = await supabase.from('sm_games').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    if (e) throw e
    await load()
  }

  async function finalizeGame(gameId, payload) {
    if (!supabase) return
    const { data, error: e } = await supabase.rpc('finalize_game', payload)
    if (e) throw e
    await load()
    return data
  }

  return { games, loading, error, reload: load, updateGame, finalizeGame }
}
