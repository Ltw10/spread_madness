import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { finalizeGame as finalizeGameInDb } from '../lib/gameFinalize'
import { createBracket as createBracketLib } from '../lib/createBracket'

export function useAdmin() {
  const { currentGameId } = useGame()
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadConfig = useCallback(async () => {
    if (!supabase || !currentGameId) {
      setConfig({})
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase
        .from('sm_game_config')
        .select('key, value')
        .eq('game_instance_id', currentGameId)
      if (e) throw e
      const map = {}
      ;(data || []).forEach((r) => { map[r.key] = r.value })
      setConfig(map)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [currentGameId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  async function setConfigValue(key, value) {
    if (!supabase || !currentGameId) return
    const { error: e } = await supabase
      .from('sm_game_config')
      .upsert(
        { game_instance_id: currentGameId, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'game_instance_id,key' }
      )
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
   * Erase this game's draft and run data so you can set up a fresh draft.
   * Clears: this game's ownership, transfer_events; optionally this game's players.
   * Resets this game's config (draft_locked, current_round). Does not touch sm_games or sm_teams (shared).
   */
  async function resetForNewGame(alsoClearPlayers = false) {
    if (!supabase || !currentGameId) return { error: 'Supabase not configured or no game selected' }
    try {
      await supabase.from('sm_transfer_events').delete().eq('game_instance_id', currentGameId)
      await supabase.from('sm_ownership').delete().eq('game_instance_id', currentGameId)
      await supabase.from('sm_game_config').upsert(
        [
          { game_instance_id: currentGameId, key: 'draft_locked', value: 'false', updated_at: new Date().toISOString() },
          { game_instance_id: currentGameId, key: 'current_round', value: '1', updated_at: new Date().toISOString() },
        ],
        { onConflict: 'game_instance_id,key' }
      )
      if (alsoClearPlayers) {
        await supabase.from('sm_players').delete().eq('game_instance_id', currentGameId)
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
