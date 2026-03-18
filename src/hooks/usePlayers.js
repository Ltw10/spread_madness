import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'

export function usePlayers() {
  const { currentGameId } = useGame()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function load() {
    if (!supabase || !currentGameId) {
      setPlayers([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error: e } = await supabase
        .from('sm_players')
        .select('*')
        .eq('game_instance_id', currentGameId)
        .order('created_at', { ascending: true })
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
    if (!currentGameId) {
      setPlayers([])
      setLoading(false)
      return
    }
    load()
    if (!supabase) return
    const channel = supabase.channel(`players:${currentGameId}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sm_players', filter: `game_instance_id=eq.${currentGameId}` },
      load
    )
    channel.subscribe()
    return () => { channel.unsubscribe() }
  }, [currentGameId])

  async function addPlayer(name, color = '#6366f1', avatar_emoji = '🏀') {
    if (!supabase || !currentGameId) throw new Error('Supabase not configured or no game selected.')
    const { data, error: e } = await supabase
      .from('sm_players')
      .insert({ game_instance_id: currentGameId, name, color, avatar_emoji })
      .select()
      .single()
    if (e) throw e
    // Keep ordering based on when players were added.
    setPlayers((prev) => {
      const next = [...prev.filter((p) => p.id !== data.id), data]
      return next.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    })
    return data
  }

  async function updatePlayer(id, updates) {
    if (!supabase || !currentGameId) return
    const { data, error: e } = await supabase
      .from('sm_players')
      .update(updates)
      .eq('id', id)
      .eq('game_instance_id', currentGameId)
      .select()
      .single()
    if (e) throw e
    setPlayers((prev) => prev.map((p) => (p.id === id ? data : p)))
    return data
  }

  async function removePlayer(id) {
    if (!supabase || !currentGameId) return
    await supabase.from('sm_players').delete().eq('id', id).eq('game_instance_id', currentGameId)
    setPlayers((prev) => prev.filter((p) => p.id !== id))
  }

  return { players, loading, error, reload: load, addPlayer, updatePlayer, removePlayer }
}
