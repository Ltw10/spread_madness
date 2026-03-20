import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const OwnershipContext = createContext(null)

/**
 * Who “drafted” each team for bracket Round of 64 display (latest draft pick per team).
 * Uses only rows with acquired_round = 1 and no transfer (transferred_from_player_id is null).
 * R64 steals also use acquired_round = 1 but set transferred_from — those must be excluded.
 */
function computeDraftOwnerPlayersByTeamId(ownership, ar1Rows) {
  const byTeam = {}
  for (const row of ar1Rows || []) {
    if (row.transferred_from_player_id != null) continue
    const tid = row.team_id
    if (tid == null) continue
    const key = String(tid)
    if (!byTeam[key]) byTeam[key] = []
    byTeam[key].push(row)
  }
  const hasActive = new Set((ownership || []).filter((o) => o.is_active === true).map((o) => String(o.team_id)))
  const out = {}
  for (const tid of Object.keys(byTeam)) {
    const rows = byTeam[tid].sort(
      (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
    )
    const last = rows[rows.length - 1]
    if (!last?.player_id || !last.player) continue
    if (!hasActive.has(tid) && last.is_active === false) continue
    out[tid] = last.player
  }
  return out
}

/**
 * Owner of `teamId` at the **start** of bracket round `bracketRound` (2–6): after all finals from prior rounds,
 * before any steal in this round. Draft baseline + steals with acquired_round < bracketRound, latest by created_at.
 */
function playerAtBracketRoundStart(rowsForTeam, bracketRound) {
  const R = Number(bracketRound)
  if (!rowsForTeam?.length || !Number.isFinite(R) || R < 2) return null
  const sorted = [...rowsForTeam].sort(
    (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
  )
  const draftRows = sorted.filter(
    (r) => Number(r.acquired_round) === 1 && r.transferred_from_player_id == null
  )
  const lastDraft = draftRows[draftRows.length - 1]
  const stealsBeforeRound = sorted.filter(
    (r) => r.transferred_from_player_id != null && Number(r.acquired_round) < R
  )
  const candidates = []
  if (lastDraft?.player_id && lastDraft.player) candidates.push(lastDraft)
  for (const s of stealsBeforeRound) {
    if (s.player_id && s.player) candidates.push(s)
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
  const last = candidates[candidates.length - 1]
  return last.player ?? null
}

function groupOwnershipHistoryByTeamId(rows) {
  const byTeam = {}
  for (const row of rows || []) {
    if (row.team_id == null) continue
    const key = String(row.team_id)
    if (!byTeam[key]) byTeam[key] = []
    byTeam[key].push(row)
  }
  return byTeam
}

/**
 * Single source of truth for sm_ownership for the current game instance.
 * (Previously each useOwnership() call had its own state — PlayerCard often stayed empty while Leaderboard had data.)
 */
export function OwnershipProvider({ gameInstanceId, children }) {
  const [ownership, setOwnership] = useState([])
  const [draftAr1Rows, setDraftAr1Rows] = useState([])
  const [ownershipHistoryRows, setOwnershipHistoryRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(
    async (silent = false) => {
      if (!supabase || !gameInstanceId) {
        setOwnership([])
        setDraftAr1Rows([])
        setOwnershipHistoryRows([])
        if (!silent) setLoading(false)
        return
      }
      if (!silent) {
        setLoading(true)
        setError(null)
      }
      try {
        const [activeRes, ar1Res, historyRes] = await Promise.all([
          supabase
            .from('sm_ownership')
            .select(`
            *,
            team:sm_teams(id, name, seed, region, is_eliminated),
            player:sm_players!sm_ownership_player_id_fkey(id, name, color, avatar_emoji),
            transferred_from:sm_players!sm_ownership_transferred_from_player_id_fkey(id, name, avatar_emoji)
          `)
            .eq('game_instance_id', gameInstanceId)
            .eq('is_active', true),
          supabase
            .from('sm_ownership')
            .select(`
            team_id,
            player_id,
            created_at,
            is_active,
            acquired_round,
            transferred_from_player_id,
            player:sm_players!sm_ownership_player_id_fkey(id, name, color, avatar_emoji)
          `)
            .eq('game_instance_id', gameInstanceId)
            .eq('acquired_round', 1)
            .is('transferred_from_player_id', null)
            .order('created_at', { ascending: true }),
          supabase
            .from('sm_ownership')
            .select(`
            team_id,
            player_id,
            created_at,
            acquired_round,
            transferred_from_player_id,
            player:sm_players!sm_ownership_player_id_fkey(id, name, color, avatar_emoji)
          `)
            .eq('game_instance_id', gameInstanceId)
            .order('created_at', { ascending: true }),
        ])
        if (activeRes.error) throw activeRes.error
        if (ar1Res.error) {
          console.warn('[ownership] draft ar1 load failed', ar1Res.error.message)
          setDraftAr1Rows([])
        } else {
          setDraftAr1Rows(ar1Res.data || [])
        }
        if (historyRes.error) {
          console.warn('[ownership] ownership history load failed', historyRes.error.message)
          setOwnershipHistoryRows([])
        } else {
          setOwnershipHistoryRows(historyRes.data || [])
        }
        setOwnership(activeRes.data || [])
      } catch (err) {
        if (!silent) setError(err.message)
        setOwnership([])
        setDraftAr1Rows([])
        setOwnershipHistoryRows([])
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [gameInstanceId]
  )

  useEffect(() => {
    if (!gameInstanceId) {
      setOwnership([])
      setDraftAr1Rows([])
      setOwnershipHistoryRows([])
      setLoading(false)
      return
    }
    load()
    if (!supabase) return undefined
    const channel = supabase.channel(`ownership-shared:${gameInstanceId}`)
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sm_ownership', filter: `game_instance_id=eq.${gameInstanceId}` },
      () => load(true)
    )
    // Embedded `team` rows go stale when only sm_teams changes (e.g. is_eliminated after a final).
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sm_teams' },
      () => load(true)
    )
    channel.subscribe()
    return () => {
      channel.unsubscribe()
    }
  }, [gameInstanceId, load])

  const addOptimistic = useCallback((row) => {
    if (!row?.team_id) return
    setOwnership((prev) => {
      const rest = prev.filter((o) => o.team_id !== row.team_id)
      return [...rest, row]
    })
  }, [])

  const draftOwnerPlayerByTeamId = useMemo(
    () => computeDraftOwnerPlayersByTeamId(ownership, draftAr1Rows),
    [ownership, draftAr1Rows]
  )

  const ownershipHistoryByTeamId = useMemo(
    () => groupOwnershipHistoryByTeamId(ownershipHistoryRows),
    [ownershipHistoryRows]
  )

  const getOwnerByTeamId = useCallback(
    (teamId) => {
      if (teamId == null) return null
      const id = String(teamId)
      return ownership.find((o) => String(o.team_id) === id)?.player ?? null
    },
    [ownership]
  )

  const getDraftOwnerByTeamId = useCallback(
    (teamId) => {
      if (teamId == null) return null
      return draftOwnerPlayerByTeamId[String(teamId)] ?? null
    },
    [draftOwnerPlayerByTeamId]
  )

  /** Owner at start of this bracket round (round 2–6); use getDraftOwnerByTeamId for round 1. */
  const getOwnerAtBracketRoundStart = useCallback(
    (teamId, bracketRound) => {
      if (teamId == null) return null
      const rows = ownershipHistoryByTeamId[String(teamId)]
      return playerAtBracketRoundStart(rows, bracketRound)
    },
    [ownershipHistoryByTeamId]
  )

  /** All active ownership team ids for a player (includes eliminated teams). */
  const getOwnedTeamIds = useCallback(
    (playerId) => {
      if (playerId == null) return []
      const pid = String(playerId)
      return ownership.filter((o) => String(o.player_id) === pid).map((o) => o.team_id)
    },
    [ownership]
  )

  /**
   * Teams still in the tournament for leaderboard “alive” counts.
   * Includes teams acquired via cover steals (same as PlayerCard “remaining”).
   * Rows without an embedded `team` still count (embed can lag after steals / optimistic updates).
   */
  const getAliveTeamIdsForPlayer = useCallback(
    (playerId) => {
      if (playerId == null) return []
      const pid = String(playerId)
      const ids = new Set()
      for (const o of ownership) {
        if (String(o.player_id) !== pid || o.team_id == null) continue
        if (o.team != null && o.team.is_eliminated === true) continue
        ids.add(o.team_id)
      }
      return [...ids]
    },
    [ownership]
  )

  const value = useMemo(
    () => ({
      ownership,
      loading,
      error,
      reload: load,
      addOptimistic,
      getOwnerByTeamId,
      getDraftOwnerByTeamId,
      getOwnerAtBracketRoundStart,
      getOwnedTeamIds,
      getAliveTeamIdsForPlayer,
    }),
    [
      ownership,
      loading,
      error,
      load,
      addOptimistic,
      getOwnerByTeamId,
      getDraftOwnerByTeamId,
      getOwnerAtBracketRoundStart,
      getOwnedTeamIds,
      getAliveTeamIdsForPlayer,
    ]
  )

  return <OwnershipContext.Provider value={value}>{children}</OwnershipContext.Provider>
}

export function useOwnership() {
  const ctx = useContext(OwnershipContext)
  if (!ctx) {
    throw new Error('useOwnership must be used within OwnershipProvider (current game session).')
  }
  return ctx
}
