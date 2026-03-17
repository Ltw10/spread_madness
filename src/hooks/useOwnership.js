import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useOwnership() {
  const [ownership, setOwnership] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load(silent = false) {
    if (!supabase) {
      setLoading(false)
      return
    }
    if (!silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const { data, error: e } = await supabase
        .from('sm_ownership')
        .select(`
          *,
          team:sm_teams(id, name, seed, region, is_eliminated),
          player:sm_players!sm_ownership_player_id_fkey(id, name, color, avatar_emoji),
          transferred_from:sm_players!sm_ownership_transferred_from_player_id_fkey(id, name, avatar_emoji)
        `)
        .eq('is_active', true)
      if (e) throw e
      setOwnership(data || [])
    } catch (err) {
      if (!silent) setError(err.message)
      setOwnership([])
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (!supabase) return
    const sub = supabase.channel('ownership').on('postgres_changes', { event: '*', schema: 'public', table: 'sm_ownership' }, load).subscribe()
    return () => { sub.unsubscribe() }
  }, [])

  /** Add or replace one row in ownership (e.g. after assign). Keeps list in sync before silent reload. */
  function addOptimistic(row) {
    if (!row?.team_id) return
    setOwnership((prev) => {
      const rest = prev.filter((o) => o.team_id !== row.team_id)
      return [...rest, row]
    })
  }

  function getOwnerByTeamId(teamId) {
    if (teamId == null) return null
    const id = String(teamId)
    return ownership.find((o) => String(o.team_id) === id)?.player ?? null
  }

  function getOwnedTeamIds(playerId) {
    return ownership.filter((o) => o.player_id === playerId).map((o) => o.team_id)
  }

  return { ownership, loading, error, reload: load, addOptimistic, getOwnerByTeamId, getOwnedTeamIds }
}
