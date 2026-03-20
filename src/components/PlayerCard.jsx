import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useOwnership } from '../hooks/useOwnership'
import { usePlayerModal } from '../context/PlayerModalContext'

function teamLabel(team) {
  if (!team) return '–'
  return team.seed != null ? `${team.seed} ${team.name}` : team.name
}

/** Single line inside a cover-steals group: underdog (struck) → team you inherited. */
function CoverChainRow({ coverTeam, acquiredTeam, round }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 font-body text-sm">
        <span className="text-slate-400 line-through decoration-slate-500">{teamLabel(coverTeam)}</span>
        <span className="font-display text-amber-500/90" aria-hidden>
          →
        </span>
        <span className="font-medium text-slate-100">{teamLabel(acquiredTeam)}</span>
      </div>
      {round != null && (
        <p className="mt-1 font-body text-[11px] uppercase tracking-wide text-amber-600/80">Cover steal · R{round}</p>
      )}
    </>
  )
}

/** All cover steals for this player share one bordered container; multiple steals stack with dividers. */
function CoverChainsGroup({ chains }) {
  if (!chains?.length) return null
  return (
    <div className="rounded border border-amber-600/40 bg-amber-950/25">
      {chains.map((chain, i) => (
        <div
          key={chain.id}
          className={`px-3 py-2.5 ${i > 0 ? 'border-t border-amber-800/50' : ''}`}
        >
          <CoverChainRow coverTeam={chain.coverTeam} acquiredTeam={chain.acquiredTeam} round={chain.round} />
        </div>
      ))}
    </div>
  )
}

function StandaloneRemainingRow({ ownershipRow, stealMeta }) {
  const o = ownershipRow
  return (
    <div className="rounded border border-slate-600 bg-slate-800/60 px-3 py-2">
      <div className="flex flex-col gap-1">
        <span className="font-body text-sm font-medium text-slate-200">{teamLabel(o.team)}</span>
        {stealMeta?.fromPlayer && (
          <p className="font-body text-xs text-amber-400/90">
            Steal: from {stealMeta.fromPlayer.avatar_emoji} {stealMeta.fromPlayer.name}
            {stealMeta.round != null && <span className="text-amber-600/80"> · R{stealMeta.round}</span>}
          </p>
        )}
        {o.transferred_from && !stealMeta?.fromPlayer && (
          <span className="font-body text-xs text-slate-500">
            Previously held by {o.transferred_from.avatar_emoji} {o.transferred_from.name}
          </span>
        )}
      </div>
    </div>
  )
}

function EliminatedRow({ ownershipRow }) {
  const o = ownershipRow
  return (
    <div className="rounded border border-slate-700 bg-slate-800/40 px-3 py-2">
      <span className="font-body text-sm text-slate-400 line-through">{teamLabel(o.team)}</span>
      {o.transferred_from && (
        <span className="mt-0.5 block font-body text-xs text-slate-600">
          Previously held by {o.transferred_from.avatar_emoji} {o.transferred_from.name}
        </span>
      )}
    </div>
  )
}

/** Team you lost when another player stole it (cover); no longer on your active roster. */
function StolenFromYouRow({ team, toPlayer, round }) {
  return (
    <div className="rounded border border-rose-900/40 bg-rose-950/20 px-3 py-2">
      <span className="font-body text-sm text-slate-400 line-through">{teamLabel(team)}</span>
      <p className="mt-1 font-body text-xs text-rose-400/90">
        Stolen{round != null && <span className="text-rose-500/80"> · R{round}</span>}
        {toPlayer ? (
          <>
            {' '}
            by {toPlayer.avatar_emoji} {toPlayer.name}
          </>
        ) : (
          <span className="text-rose-300/80"> — unassigned cover (you no longer hold this team)</span>
        )}
      </p>
    </div>
  )
}

export function PlayerCard() {
  const { selectedPlayer, closePlayerCard } = usePlayerModal()
  const { currentGameId } = useGame()
  const { ownership, loading } = useOwnership()
  const [coverSteals, setCoverSteals] = useState([])
  const [stolenFromYou, setStolenFromYou] = useState([])
  const [stealsLoading, setStealsLoading] = useState(false)

  useEffect(() => {
    if (!supabase || !currentGameId || !selectedPlayer?.id) {
      setCoverSteals([])
      setStolenFromYou([])
      return
    }
    const pid = selectedPlayer.id
    let cancelled = false
    async function loadSteals() {
      setStealsLoading(true)
      try {
        const { data, error } = await supabase
          .from('sm_transfer_events')
          .select(
            `
            id,
            team_id,
            round,
            created_at,
            to_player_id,
            from_player_id,
            team:sm_teams!sm_transfer_events_team_id_fkey(id, name, seed),
            from_player:sm_players!sm_transfer_events_from_player_id_fkey(id, name, avatar_emoji),
            to_player:sm_players!sm_transfer_events_to_player_id_fkey(id, name, avatar_emoji),
            game:sm_games(
              id,
              round,
              cover_team:sm_teams!sm_games_cover_team_id_fkey(id, name, seed)
            )
          `
          )
          .eq('game_instance_id', currentGameId)
          .or(`to_player_id.eq.${pid},from_player_id.eq.${pid}`)
        if (cancelled) return
        if (error) {
          console.warn('[PlayerCard] transfer events load failed', error)
          setCoverSteals([])
          setStolenFromYou([])
          return
        }
        const rows = data || []
        setCoverSteals(rows.filter((e) => String(e.to_player_id) === String(pid)))
        setStolenFromYou(rows.filter((e) => String(e.from_player_id) === String(pid)))
      } finally {
        if (!cancelled) setStealsLoading(false)
      }
    }
    loadSteals()
    return () => {
      cancelled = true
    }
  }, [currentGameId, selectedPlayer?.id])

  const coverChains = useMemo(() => {
    const list = (coverSteals || [])
      .filter((ev) => ev.game?.cover_team?.id && ev.team?.id)
      .map((ev) => ({
        id: ev.id,
        coverTeam: ev.game.cover_team,
        acquiredTeam: ev.team,
        round: ev.round ?? ev.game?.round,
      }))
    list.sort((a, b) => (a.acquiredTeam?.seed ?? 99) - (b.acquiredTeam?.seed ?? 99))
    return list
  }, [coverSteals])

  const acquiredIdsInChain = useMemo(
    () => new Set(coverChains.map((c) => String(c.acquiredTeam.id))),
    [coverChains]
  )
  const coverIdsInChain = useMemo(
    () => new Set(coverChains.map((c) => String(c.coverTeam.id))),
    [coverChains]
  )

  const stealByAcquiredTeamId = useMemo(() => {
    const m = new Map()
    for (const ev of coverSteals) {
      const tid = ev.team_id != null ? String(ev.team_id) : null
      if (!tid) continue
      m.set(tid, {
        coverTeam: ev.game?.cover_team,
        acquiredTeam: ev.team,
        round: ev.round ?? ev.game?.round,
        fromPlayer: ev.from_player,
      })
    }
    return m
  }, [coverSteals])

  /** Lost via steal — show under eliminated; dedupe by team_id (latest event wins). */
  const stolenFromYouRows = useMemo(() => {
    const byTeam = new Map()
    for (const ev of stolenFromYou) {
      if (!ev.team?.id) continue
      const key = String(ev.team.id)
      const prev = byTeam.get(key)
      if (!prev || new Date(ev.created_at || 0) >= new Date(prev.created_at || 0)) {
        byTeam.set(key, ev)
      }
    }
    return [...byTeam.values()].sort(
      (a, b) => (a.team?.seed ?? 99) - (b.team?.seed ?? 99) || String(a.id).localeCompare(String(b.id))
    )
  }, [stolenFromYou])

  if (!selectedPlayer) return null

  const playerId = String(selectedPlayer.id ?? '')
  const myRows = (ownership || []).filter((o) => String(o.player_id) === playerId)
  const remainingRows = myRows
    .filter((o) => !o.team?.is_eliminated)
    .sort((a, b) => (a.team?.seed ?? 99) - (b.team?.seed ?? 99))

  const remainingStandalone = remainingRows.filter((o) => !acquiredIdsInChain.has(String(o.team_id)))
  const eliminatedStandalone = myRows
    .filter((o) => o.team?.is_eliminated)
    .filter((o) => !coverIdsInChain.has(String(o.team_id)))
    .sort((a, b) => (a.team?.seed ?? 99) - (b.team?.seed ?? 99))

  const remainingCount = coverChains.length + remainingStandalone.length
  const eliminatedOwnedIds = new Set(eliminatedStandalone.map((o) => String(o.team_id)))
  const stolenFromYouVisible = stolenFromYouRows.filter(
    (ev) => ev.team?.id && !eliminatedOwnedIds.has(String(ev.team.id))
  )
  const eliminatedTotal = eliminatedStandalone.length + stolenFromYouVisible.length

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        aria-hidden
        onClick={closePlayerCard}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-card-title"
      >
        <div className="border-b border-slate-600 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="player-card-title" className="font-display text-lg tracking-wide text-slate-100">
              <span className="mr-2 inline-block h-4 w-4 rounded-full" style={{ backgroundColor: selectedPlayer.color }} />
              {selectedPlayer.avatar_emoji} {selectedPlayer.name}
            </h2>
            <button
              type="button"
              onClick={closePlayerCard}
              className="rounded p-1 font-body text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          <p className="font-body text-xs text-slate-500 -mt-1">
            When your underdog covers, <strong className="text-slate-400">Teams remaining</strong> shows the team you
            inherited, with the covering pick struck through and an arrow to the new team. Multiple cover steals stack
            in the same box. If someone steals a team you had, that team still appears under{' '}
            <strong className="text-slate-400">Teams eliminated</strong> for you.
          </p>

          <section>
            <h3 className="font-display text-sm uppercase tracking-wide text-emerald-400/90 mb-2">
              Teams remaining ({remainingCount})
            </h3>
            {loading && myRows.length === 0 ? (
              <p className="font-body text-sm text-slate-400">Loading teams…</p>
            ) : remainingCount === 0 ? (
              <p className="font-body text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-2">
                {coverChains.length > 0 && (
                  <li>
                    <CoverChainsGroup chains={coverChains} />
                  </li>
                )}
                {remainingStandalone.map((o) => {
                  const meta = stealByAcquiredTeamId.get(String(o.team_id))
                  const stealOnly =
                    meta && !meta.coverTeam && meta.fromPlayer
                      ? { fromPlayer: meta.fromPlayer, round: meta.round }
                      : null
                  return (
                    <li key={o.team_id}>
                      <StandaloneRemainingRow ownershipRow={o} stealMeta={stealOnly} />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section>
            <h3 className="font-display text-sm uppercase tracking-wide text-slate-500 mb-2">
              Teams eliminated ({eliminatedTotal})
            </h3>
            {loading && myRows.length === 0 ? (
              <p className="font-body text-sm text-slate-400">Loading…</p>
            ) : eliminatedTotal === 0 ? (
              <p className="font-body text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-2">
                {eliminatedStandalone.map((o) => (
                  <li key={o.team_id}>
                    <EliminatedRow ownershipRow={o} />
                  </li>
                ))}
                {stolenFromYouVisible.map((ev) => (
                  <li key={`stolen-${ev.id}`}>
                    <StolenFromYouRow team={ev.team} toPlayer={ev.to_player} round={ev.round} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {stealsLoading && coverSteals.length === 0 && stolenFromYou.length === 0 && (
            <p className="font-body text-xs text-slate-600">Loading steal history…</p>
          )}
        </div>
      </div>
    </>
  )
}
