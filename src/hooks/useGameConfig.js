import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Per-game config (draft_locked, current_round) from sm_game_config.
 * When gameId is null, returns empty config and no loading.
 */
export function useGameConfig(gameId) {
  const [config, setConfig] = useState({})
  const [loading, setLoading] = useState(!!gameId)

  const loadConfig = useCallback(async () => {
    if (!supabase || !gameId) {
      setLoading(false)
      setConfig({})
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('sm_game_config')
        .select('key, value')
        .eq('game_instance_id', gameId)
      if (error) throw error
      const map = {}
      ;(data || []).forEach((r) => { map[r.key] = r.value })
      setConfig(map)
    } catch (err) {
      setConfig({})
    } finally {
      setLoading(false)
    }
  }, [gameId])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Keep config in sync across admin/player clients.
  useEffect(() => {
    if (!supabase || !gameId) return
    const channel = supabase.channel(`game_config:${gameId}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sm_game_config', filter: `game_instance_id=eq.${gameId}` },
      loadConfig
    )
    channel.subscribe()
    return () => { channel.unsubscribe() }
  }, [gameId, loadConfig])

  const setConfigValue = useCallback(async (key, value) => {
    if (!supabase || !gameId) return
    const { error } = await supabase
      .from('sm_game_config')
      .upsert(
        {
          game_instance_id: gameId,
          key,
          value,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'game_instance_id,key' }
      )
    if (error) throw error
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [gameId])

  return { config, loading, reload: loadConfig, setConfigValue }
}
