import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

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
      const { data, error: e } = await supabase
        .from('sm_games')
        .select(`
          *,
          team1:sm_teams!sm_games_team1_id_fkey(id, name, seed, region, espn_id, is_eliminated),
          team2:sm_teams!sm_games_team2_id_fkey(id, name, seed, region, espn_id, is_eliminated),
          spread_team:sm_teams!sm_games_spread_team_id_fkey(id, name),
          winner_team:sm_teams!sm_games_winner_team_id_fkey(id, name),
          cover_team:sm_teams!sm_games_cover_team_id_fkey(id, name)
        `)
        .order('round')
        .order('region')
      if (e) throw e
      const list = data || []
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
