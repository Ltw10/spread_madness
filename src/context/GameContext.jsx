import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { hashPassword, verifyPassword } from '../lib/passwordHash'

const STORAGE_KEY = 'spread_madness_game_id'

const GameContext = createContext(null)

export function useGame() {
  const ctx = useContext(GameContext)
  return ctx
}

export function GameProvider({ children }) {
  const [currentGameId, setCurrentGameIdState] = useState(() => {
    if (typeof window === 'undefined') return null
    return sessionStorage.getItem(STORAGE_KEY) || null
  })
  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(true)

  const setCurrentGameId = useCallback((id) => {
    if (id) sessionStorage.setItem(STORAGE_KEY, id)
    else sessionStorage.removeItem(STORAGE_KEY)
    setCurrentGameIdState(id)
  }, [])

  const loadGames = useCallback(async () => {
    if (!supabase) {
      setGamesLoading(false)
      return
    }
    setGamesLoading(true)
    try {
      const { data, error } = await supabase
        .from('sm_game_instances')
        .select('id, name, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      setGames(data || [])
    } catch (err) {
      setGames([])
    } finally {
      setGamesLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGames()
    if (!supabase) return
    const sub = supabase
      .channel('game_instances')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sm_game_instances' }, loadGames)
      .subscribe()
    return () => sub.unsubscribe()
  }, [loadGames])

  /** Returns { needsPassword, name } for the game (fetches password_hash to check, not exposed to list). */
  const getGameForUnlock = useCallback(async (gameId) => {
    if (!supabase || !gameId) return null
    const { data, error } = await supabase
      .from('sm_game_instances')
      .select('id, name, password_hash')
      .eq('id', gameId)
      .single()
    if (error || !data) return null
    return { needsPassword: !!(data.password_hash && data.password_hash.length > 0), name: data.name }
  }, [])

  /** Verify game password and set current game on success. Returns { ok } or { ok: false, error }. */
  const unlockGame = useCallback(async (gameId, password) => {
    if (!supabase || !gameId) return { ok: false, error: 'Invalid game' }
    const { data, error } = await supabase
      .from('sm_game_instances')
      .select('id, name, password_hash')
      .eq('id', gameId)
      .single()
    if (error || !data) return { ok: false, error: 'Game not found' }
    if (!data.password_hash) {
      setCurrentGameId(gameId)
      return { ok: true }
    }
    const valid = await verifyPassword(password, data.password_hash)
    if (!valid) return { ok: false, error: 'Wrong password' }
    setCurrentGameId(gameId)
    return { ok: true }
  }, [setCurrentGameId])

  const createGame = useCallback(async (name, gamePassword, adminPassword) => {
    if (!supabase || !name?.trim()) throw new Error('Name required')
    if (!gamePassword?.trim()) throw new Error('Game password required')
    const adminInput = (adminPassword ?? '').trim() || 'admin'
    const { data: configRows } = await supabase.from('sm_config').select('value').eq('key', 'admin_password_hash').maybeSingle()
    const adminHash = configRows?.value ?? ''
    const adminValid = adminHash ? await verifyPassword(adminInput, adminHash) : adminInput === 'admin'
    if (!adminValid) throw new Error('Wrong admin password')
    const gamePasswordHash = await hashPassword(gamePassword.trim())
    const { data, error } = await supabase
      .from('sm_game_instances')
      .insert({ name: name.trim(), password_hash: gamePasswordHash })
      .select('id, name, created_at')
      .single()
    if (error) throw error
    await loadGames()
    setCurrentGameId(data.id)
    return data
  }, [loadGames, setCurrentGameId])

  const renameGame = useCallback(async (gameId, newName) => {
    if (!supabase || !gameId || !newName?.trim()) throw new Error('Game and name required')
    const { error } = await supabase
      .from('sm_game_instances')
      .update({ name: newName.trim() })
      .eq('id', gameId)
    if (error) throw error
    await loadGames()
  }, [loadGames])

  const updateGamePassword = useCallback(async (gameId, currentPassword, newPassword) => {
    if (!supabase || !gameId || !newPassword?.trim()) throw new Error('Game and new password required')
    const { data, error } = await supabase
      .from('sm_game_instances')
      .select('password_hash')
      .eq('id', gameId)
      .single()
    if (error || !data) throw new Error('Game not found')
    if (data.password_hash) {
      const valid = await verifyPassword(currentPassword, data.password_hash)
      if (!valid) throw new Error('Wrong current password')
    }
    const newHash = await hashPassword(newPassword.trim())
    const { error: updateError } = await supabase
      .from('sm_game_instances')
      .update({ password_hash: newHash })
      .eq('id', gameId)
    if (updateError) throw updateError
    await loadGames()
  }, [loadGames])

  const value = {
    currentGameId,
    setCurrentGameId,
    games,
    gamesLoading,
    loadGames,
    createGame,
    renameGame,
    getGameForUnlock,
    unlockGame,
    updateGamePassword,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}
