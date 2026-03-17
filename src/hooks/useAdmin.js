import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { finalizeGame as finalizeGameInDb } from '../lib/gameFinalize'
import { createBracket as createBracketLib } from '../lib/createBracket'

export function useAdmin() {
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadConfig = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase.from('sm_config').select('key, value')
      if (e) throw e
      const map = {}
      ;(data || []).forEach((r) => { map[r.key] = r.value })
      setConfig(map)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function setConfigValue(key, value) {
    if (!supabase) return
    const { error: e } = await supabase.from('sm_config').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    if (e) throw e
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  /** Finalize a game (manual override in Admin). Uses shared logic so it stays in sync with auto-finalize. */
  async function finalizeGame(game, team1Score, team2Score) {
    const result = await finalizeGameInDb(supabase, game, team1Score, team2Score)
    return result ?? { coverTeamId: null, winnerTeamId: null, underdogCovered: false }
  }

  async function createBracket() {
    return createBracketLib(supabase)
  }

  /**
   * Erase draft and run data so you can set up a fresh game (e.g. after testing).
   * Clears: ownership, transfer_events; unlocks draft; resets teams to not eliminated.
   * Leaves sm_games (bracket) intact so the bracket and spreads are preserved.
   * Optionally clears players so you can add a new roster.
   */
  async function resetForNewGame(alsoClearPlayers = false) {
    if (!supabase) return { error: 'Supabase not configured' }
    try {
      await supabase.from('sm_transfer_events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('sm_ownership').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('sm_teams').update({ is_eliminated: false, updated_at: new Date().toISOString() }).eq('is_eliminated', true)
      await supabase.from('sm_config').upsert(
        [
          { key: 'draft_locked', value: 'false', updated_at: new Date().toISOString() },
          { key: 'current_round', value: '1', updated_at: new Date().toISOString() },
        ],
        { onConflict: 'key' }
      )
      if (alsoClearPlayers) {
        await supabase.from('sm_players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      }
      await loadConfig()
      return { ok: true }
    } catch (err) {
      return { error: err.message }
    }
  }

  return {
    config,
    loading,
    error,
    reload: loadConfig,
    setConfigValue,
    finalizeGame,
    createBracket,
    resetForNewGame,
  }
}
