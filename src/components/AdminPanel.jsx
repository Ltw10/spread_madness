import { useState, useEffect, useMemo } from 'react'
import { useAdmin } from '../hooks/useAdmin'
import { useGames } from '../hooks/useGames'
import { useGame } from '../context/GameContext'
import { runScoreSyncOnce } from '../hooks/useAutoScoreSync'
import { supabase } from '../lib/supabase'
import { hashPassword, verifyPassword } from '../lib/passwordHash'
import { GameMatchup } from './GameMatchup'
import { usePlayers } from '../hooks/usePlayers'

export function AdminPanel({ onLogout }) {
  const {
    config,
    setConfigValue,
    finalizeGame,
    refinalizeAllFinalGames,
    replayFinalsFromDraftBaseline,
    createBracket,
    resetForNewGame,
    error: adminError,
  } = useAdmin()
  const { games, reload: reloadGames } = useGames()
  const { currentGameId, games: gameInstances, renameGame, updateGamePassword } = useGame()
  const { players, loading: playersLoading } = usePlayers()
  const [syncResult, setSyncResult] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [clearScoresConfirm, setClearScoresConfirm] = useState(false)
  const [clearingScores, setClearingScores] = useState(false)
  const [refinalizeConfirm, setRefinalizeConfirm] = useState(false)
  const [refinalizing, setRefinalizing] = useState(false)
  const [refinalizeResult, setRefinalizeResult] = useState(null)
  const [replayDraftConfirm, setReplayDraftConfirm] = useState(false)
  const [replayDrafting, setReplayDrafting] = useState(false)
  const [replayDraftResult, setReplayDraftResult] = useState(null)
  const [bracketResult, setBracketResult] = useState(null)
  const [finalizeModal, setFinalizeModal] = useState(null)
  const [overrideScores, setOverrideScores] = useState({ team1: '', team2: '' })
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetAlsoPlayers, setResetAlsoPlayers] = useState(false)
  const [resetResult, setResetResult] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameResult, setRenameResult] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const [draftOrderIds, setDraftOrderIds] = useState([])
  const [draftOrderSaving, setDraftOrderSaving] = useState(false)
  const [draftOrderResult, setDraftOrderResult] = useState(null)
  const [draftHasPicks, setDraftHasPicks] = useState(false)
  const [adminPwCurrent, setAdminPwCurrent] = useState('')
  const [adminPwNew, setAdminPwNew] = useState('')
  const [adminPwResult, setAdminPwResult] = useState(null)
  const [adminPwSaving, setAdminPwSaving] = useState(false)
  const [gamePwCurrent, setGamePwCurrent] = useState('')
  const [gamePwNew, setGamePwNew] = useState('')
  const [gamePwResult, setGamePwResult] = useState(null)
  const [gamePwSaving, setGamePwSaving] = useState(false)
  const currentGame = currentGameId && gameInstances.find((g) => g.id === currentGameId)

  useEffect(() => {
    setRenameValue(currentGame?.name ?? '')
  }, [currentGame?.name])

  const draftLocked = config.draft_locked === 'true'

  const parsedDraftOrder = useMemo(() => {
    if (!config?.draft_order) return null
    try {
      const parsed = JSON.parse(config.draft_order)
      if (Array.isArray(parsed)) return parsed
    } catch (e) {}
    return null
  }, [config?.draft_order])

  useEffect(() => {
    setDraftOrderIds([])
    setDraftOrderResult(null)
  }, [currentGameId])

  // Disable draft-order edits after any draft picks exist.
  useEffect(() => {
    if (!currentGameId) {
      setDraftHasPicks(false)
      return
    }
    let cancelled = false
    async function load() {
      try {
        const { count } = await supabase
          .from('sm_ownership')
          .select('id', { count: 'exact', head: true })
          .eq('game_instance_id', currentGameId)
          .eq('acquired_round', 1)
          .is('transferred_from_player_id', null)
          .eq('is_active', true)
        if (cancelled) return
        setDraftHasPicks((count || 0) > 0)
      } catch (e) {
        if (cancelled) return
        setDraftHasPicks(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [currentGameId])

  // Initialize draft order once players exist (or from saved config).
  useEffect(() => {
    if (playersLoading) return
    if (!players?.length) {
      setDraftOrderIds([])
      return
    }
    const baseIds = (parsedDraftOrder && parsedDraftOrder.length > 0)
      ? parsedDraftOrder
      : players.map((p) => p.id)

    // Don't overwrite admin edits once they start; just append any new players.
    if (draftOrderIds.length > 0) {
      const idSet = new Set(draftOrderIds.map((id) => String(id)))
      const remaining = players
        .filter((p) => !idSet.has(String(p.id)))
        .map((p) => p.id)
      if (remaining.length) setDraftOrderIds((prev) => [...prev, ...remaining])
      return
    }

    const idSet = new Set(baseIds.map((id) => String(id)))
    const remaining = players
      .filter((p) => !idSet.has(String(p.id)))
      .map((p) => p.id)

    setDraftOrderIds([...baseIds, ...remaining])
  }, [playersLoading, players, parsedDraftOrder, draftOrderIds.length])

  const moveDraftOrderItem = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= draftOrderIds.length) return
    setDraftOrderIds((prev) => {
      const copy = [...prev]
      const [item] = copy.splice(fromIdx, 1)
      copy.splice(toIdx, 0, item)
      return copy
    })
    setDraftOrderResult(null)
  }

  const handleSaveDraftOrder = async () => {
    setDraftOrderResult(null)
    if (!currentGameId) {
      setDraftOrderResult('No game selected.')
      return
    }
    if (!players?.length) {
      setDraftOrderResult('Add players first.')
      return
    }
    const idSet = new Set(draftOrderIds.map((id) => String(id)))
    if (idSet.size !== players.length || draftOrderIds.length !== players.length) {
      setDraftOrderResult('Draft order must include every player exactly once.')
      return
    }
    setDraftOrderSaving(true)
    try {
      await setConfigValue('draft_order', JSON.stringify(draftOrderIds))
      setDraftOrderResult('Saved.')
    } catch (e) {
      setDraftOrderResult(e?.message || 'Failed to save draft order.')
    } finally {
      setDraftOrderSaving(false)
    }
  }

  const handleFinalize = async (game) => {
    const t1 = overrideScores.team1 !== '' ? parseInt(overrideScores.team1, 10) : game.team1_score
    const t2 = overrideScores.team2 !== '' ? parseInt(overrideScores.team2, 10) : game.team2_score
    if (typeof t1 !== 'number' || typeof t2 !== 'number') return
    try {
      await finalizeGame(game, t1, t2)
      setFinalizeModal(null)
      setOverrideScores({ team1: '', team2: '' })
    } catch (e) {
      setSyncResult({ error: e.message })
    }
  }

  const inProgressGames = games.filter((g) => g.status === 'in_progress')
  const scheduledGames = games.filter((g) => g.status === 'scheduled')

  return (
    <div className="space-y-6 rounded-xl border border-slate-600 bg-slate-900/90 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-slate-100">Admin Panel</h2>
        {onLogout && (
          <button type="button" onClick={onLogout} className="rounded bg-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-500">
            Logout
          </button>
        )}
      </div>

      {adminError && <p className="text-sm text-red-400">{adminError}</p>}

      <section>
        <h3 className="font-body font-medium text-slate-300">Bracket</h3>
        <p className="text-xs text-slate-400">Create the full bracket (all 6 rounds, 63 games) and assign teams to Round 1 matchups. Requires teams in the database—they are seeded from ESPN when you first open the app if empty.</p>
        <button
          type="button"
          onClick={async () => {
            setBracketResult(null)
            try {
              const r = await createBracket()
              setBracketResult(r)
            } catch (e) {
              setBracketResult({ error: e.message })
            }
          }}
          className="mt-1 rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
        >
          Create Bracket
        </button>
        {bracketResult && (
          <p className="mt-2 text-sm text-slate-400">
            {bracketResult.error ? bracketResult.error : `Created ${bracketResult.created ?? 0} games.`}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Scores</h3>
        <p className="text-xs text-slate-400">ESPN polls every 60s. Use this to fetch scores from ESPN and save to the database now (e.g. if auto-polling isn’t updating).</p>
        <button
          type="button"
          disabled={syncing || !games?.length}
          onClick={async () => {
            setSyncResult(null)
            setSyncing(true)
            try {
              const result = await runScoreSyncOnce(supabase, games, reloadGames)
              setSyncResult(result.error ? { error: result.error } : { updated: result.updated ?? 0 })
            } catch (e) {
              setSyncResult({ error: e?.message || 'Sync failed' })
            } finally {
              setSyncing(false)
            }
          }}
          className="mt-1 rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
        >
          {syncing ? 'Refreshing…' : 'Refresh scores now'}
        </button>

        {!clearScoresConfirm ? (
          <button
            type="button"
            disabled={syncing || clearingScores || !games?.length}
            onClick={() => {
              setSyncResult(null)
              setClearScoresConfirm(true)
            }}
            className="mt-2 rounded border border-amber-600/60 bg-amber-900/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/40 disabled:opacity-60"
          >
            Clear non-final scores and repull from ESPN…
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-slate-400">
              This will clear scores for games that are not final, then immediately refetch from ESPN. Final games are left untouched to avoid re-finalizing and duplicating transfer events.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={syncing || clearingScores}
                onClick={async () => {
                  setClearingScores(true)
                  setSyncResult(null)
                  try {
                    const { error: clearErr } = await supabase
                      .from('sm_games')
                      .update({
                        team1_score: null,
                        team2_score: null,
                        winner_team_id: null,
                        cover_team_id: null,
                        status: 'scheduled',
                        updated_at: new Date().toISOString(),
                      })
                      .neq('status', 'final')
                    if (clearErr) throw clearErr

                    const { data: freshGames, error: freshErr } = await supabase
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
                    if (freshErr) throw freshErr
                    const result = await runScoreSyncOnce(supabase, freshGames || [], reloadGames)
                    setSyncResult(result.error ? { error: result.error } : { updated: result.updated ?? 0 })
                  } catch (e) {
                    setSyncResult({ error: e?.message || 'Failed' })
                  } finally {
                    setClearingScores(false)
                    setClearScoresConfirm(false)
                  }
                }}
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-60"
              >
                {clearingScores ? 'Clearing…' : 'Yes, clear + repull'}
              </button>
              <button
                type="button"
                disabled={clearingScores}
                onClick={() => setClearScoresConfirm(false)}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {syncResult && (
          <p className="mt-2 text-sm text-slate-400">
            {syncResult.error ? <span className="text-red-400">{syncResult.error}</span> : `Updated ${syncResult.updated ?? 0} game(s).`}
          </p>
        )}

        <p className="mt-3 text-xs text-slate-500">
          <strong className="text-slate-400">Quick refinalize</strong> only reapplies math on top of current ownership. It skips steals that already look correct, so it{' '}
          <strong className="text-slate-400">cannot undo a wrong steal</strong>. Use <strong className="text-slate-400">full replay from draft</strong> to wipe steals,
          restore post-draft rosters from history, reset the shared bracket, and simulate every final again.
        </p>

        {!refinalizeConfirm ? (
          <button
            type="button"
            disabled={syncing || clearingScores || refinalizing || replayDrafting || replayDraftConfirm || !games?.length}
            onClick={() => {
              setRefinalizeResult(null)
              setRefinalizeConfirm(true)
            }}
            className="mt-2 block rounded border border-violet-600/60 bg-violet-900/30 px-3 py-2 text-sm text-violet-200 hover:bg-violet-800/40 disabled:opacity-60"
          >
            Quick refinalize all final games…
          </button>
        ) : (
          <div className="mt-2 space-y-2 rounded-lg border border-violet-600/40 bg-violet-950/40 p-3">
            <p className="text-xs text-slate-400">
              Recomputes winner/cover from scores + spread for each <strong className="text-slate-300">final</strong> game in bracket order. Fills missing steals only;
              does not revert mistaken transfers.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={refinalizing}
                onClick={async () => {
                  setRefinalizing(true)
                  setRefinalizeResult(null)
                  try {
                    const result = await refinalizeAllFinalGames(games)
                    await reloadGames()
                    setRefinalizeResult(result)
                  } catch (e) {
                    setRefinalizeResult({ processed: 0, errors: [e?.message || String(e)], total: 0 })
                  } finally {
                    setRefinalizing(false)
                    setRefinalizeConfirm(false)
                  }
                }}
                className="rounded bg-violet-600 px-3 py-2 text-sm text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {refinalizing ? 'Re-running…' : 'Yes, quick refinalize'}
              </button>
              <button
                type="button"
                disabled={refinalizing}
                onClick={() => setRefinalizeConfirm(false)}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {refinalizeResult && (
          <p className="mt-2 text-sm text-slate-400">
            Refinalized {refinalizeResult.processed} / {refinalizeResult.total} final game(s).
            {refinalizeResult.errors?.length > 0 && (
              <span className="mt-1 block text-red-400">{refinalizeResult.errors.join('; ')}</span>
            )}
          </p>
        )}

        {!replayDraftConfirm ? (
          <button
            type="button"
            disabled={syncing || clearingScores || refinalizing || refinalizeConfirm || replayDrafting || !games?.length}
            onClick={() => {
              setReplayDraftResult(null)
              setReplayDraftConfirm(true)
            }}
            className="mt-3 block rounded border border-rose-600/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200 hover:bg-rose-900/50 disabled:opacity-60"
          >
            Full replay from draft (undo steals, re-simulate finals)…
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded-lg border border-rose-600/50 bg-rose-950/30 p-3">
            <p className="text-xs text-rose-200/95">
              This <strong>deletes all ownership and transfer events</strong> for this pool, then rebuilds rosters from every{' '}
              <code className="text-rose-100">acquired_round = 1</code> pick (latest pick per team wins). It clears{' '}
              <strong>all</strong> teams’ <code className="text-rose-100">is_eliminated</code>, clears winner/cover on every game, and empties round &gt; 1 matchup slots,
              then replays finals in order using current scores. <strong>Other pools on the same Supabase project share sm_teams and sm_games</strong> — they will see the same
              bracket and eliminations.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={replayDrafting}
                onClick={async () => {
                  setReplayDrafting(true)
                  setReplayDraftResult(null)
                  try {
                    const result = await replayFinalsFromDraftBaseline()
                    await reloadGames()
                    setReplayDraftResult(result)
                  } catch (e) {
                    setReplayDraftResult({ ok: false, error: e?.message || String(e) })
                  } finally {
                    setReplayDrafting(false)
                    setReplayDraftConfirm(false)
                  }
                }}
                className="rounded bg-rose-600 px-3 py-2 text-sm text-white hover:bg-rose-500 disabled:opacity-60"
              >
                {replayDrafting ? 'Replaying…' : 'Yes, full replay'}
              </button>
              <button
                type="button"
                disabled={replayDrafting}
                onClick={() => setReplayDraftConfirm(false)}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {replayDraftResult && (
          <p className="mt-2 text-sm text-slate-400">
            {replayDraftResult.ok === false ? (
              <span className="text-red-400">{replayDraftResult.error}</span>
            ) : (
              <>
                Full replay: {replayDraftResult.processed} / {replayDraftResult.total} final game(s). Restored {replayDraftResult.draftTeamsRestored} draft team assignments.
                {replayDraftResult.errors?.length > 0 && (
                  <span className="mt-1 block text-red-400">{replayDraftResult.errors.join('; ')}</span>
                )}
              </>
            )}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Draft</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draftLocked}
            onChange={(e) => setConfigValue('draft_locked', e.target.checked ? 'true' : 'false')}
          />
          <span className="text-sm text-slate-300">Draft locked</span>
        </label>

        <div className="mt-4">
          <h4 className="font-body font-medium text-slate-300">Draft order</h4>
          {playersLoading ? (
            <p className="text-xs text-slate-400 mt-1">Loading players…</p>
          ) : !players?.length ? (
            <p className="text-xs text-slate-400 mt-1">Add players first (on the Draft page).</p>
          ) : (
            <>
              <p className="text-xs text-slate-400 mt-1">
                This controls player numbering on the Draft screen and uses snake order when picking teams.
              </p>

              {draftLocked || draftHasPicks ? (
                <p className="text-sm text-slate-400 mt-2">
                  {draftHasPicks ? 'Draft picks already started—draft order is locked.' : 'Draft is locked.'}
                </p>
              ) : (
                <>
                  <div className="mt-2 space-y-2">
                    {draftOrderIds.map((pid, idx) => {
                      const p = players.find((x) => String(x.id) === String(pid))
                      if (!p) return null
                      return (
                        <div key={pid} className="flex items-center gap-2">
                          <span className="w-6 text-center text-sm text-slate-300">{idx + 1}</span>
                          <span className="flex-1 text-slate-200">
                            {p.avatar_emoji} {p.name}
                          </span>
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveDraftOrderItem(idx, idx - 1)}
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-40"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={idx === draftOrderIds.length - 1}
                            onClick={() => moveDraftOrderItem(idx, idx + 1)}
                            className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600 disabled:opacity-40"
                          >
                            Down
                          </button>
                        </div>
                      )
                    })}
                  </div>

                  <div className="mt-3 flex gap-2 items-center">
                    <button
                      type="button"
                      disabled={draftOrderSaving || draftOrderIds.length !== players.length}
                      onClick={handleSaveDraftOrder}
                      className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500 disabled:opacity-60"
                    >
                      {draftOrderSaving ? 'Saving…' : 'Save draft order'}
                    </button>
                  </div>

                  {draftOrderResult && (
                    <p className={`mt-2 text-sm ${draftOrderResult === 'Saved.' ? 'text-slate-400' : 'text-red-400'}`}>
                      {draftOrderResult}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Rename game</h3>
        <p className="text-xs text-slate-400">Change the name of the current game (shown in the nav and game selector).</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="Game name"
            className="rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 w-48"
          />
          <button
            type="button"
            disabled={renaming || !currentGameId || !renameValue.trim() || renameValue.trim() === currentGame?.name}
            onClick={async () => {
              setRenameResult(null)
              setRenaming(true)
              try {
                await renameGame(currentGameId, renameValue.trim())
                setRenameResult('Saved.')
              } catch (e) {
                setRenameResult(e?.message || 'Rename failed')
              } finally {
                setRenaming(false)
              }
            }}
            className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
          >
            {renaming ? 'Saving…' : 'Rename'}
          </button>
        </div>
        {renameResult && (
          <p className="mt-2 text-sm text-slate-400">
            {renameResult === 'Saved.' ? renameResult : <span className="text-red-400">{renameResult}</span>}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Change admin password</h3>
        <p className="text-xs text-slate-400">Used to log in to Admin and to create new games.</p>
        <div className="mt-2 space-y-2">
          <input
            type="password"
            value={adminPwCurrent}
            onChange={(e) => setAdminPwCurrent(e.target.value)}
            placeholder="Current admin password"
            className="block w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
          />
          <input
            type="password"
            value={adminPwNew}
            onChange={(e) => setAdminPwNew(e.target.value)}
            placeholder="New admin password"
            className="block w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
          />
          <button
            type="button"
            disabled={adminPwSaving || !adminPwCurrent.trim() || !adminPwNew.trim()}
            onClick={async () => {
              setAdminPwResult(null)
              setAdminPwSaving(true)
              try {
                const { data } = await supabase.from('sm_config').select('value').eq('key', 'admin_password_hash').maybeSingle()
                const hash = data?.value ?? ''
                const valid = hash ? await verifyPassword(adminPwCurrent, hash) : adminPwCurrent === 'admin'
                if (!valid) throw new Error('Wrong current password')
                const newHash = await hashPassword(adminPwNew.trim())
                await supabase.from('sm_config').upsert({ key: 'admin_password_hash', value: newHash, updated_at: new Date().toISOString() }, { onConflict: 'key' })
                setAdminPwResult('Saved.')
                setAdminPwCurrent('')
                setAdminPwNew('')
              } catch (e) {
                setAdminPwResult(e?.message || 'Failed')
              } finally {
                setAdminPwSaving(false)
              }
            }}
            className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
          >
            {adminPwSaving ? 'Saving…' : 'Change admin password'}
          </button>
        </div>
        {adminPwResult && (
          <p className="mt-2 text-sm text-slate-400">
            {adminPwResult === 'Saved.' ? adminPwResult : <span className="text-red-400">{adminPwResult}</span>}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Change game password</h3>
        <p className="text-xs text-slate-400">Password required to open this game from the game selector. Leave current blank if the game has no password yet.</p>
        <div className="mt-2 space-y-2">
          <input
            type="password"
            value={gamePwCurrent}
            onChange={(e) => setGamePwCurrent(e.target.value)}
            placeholder="Current game password (if set)"
            className="block w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
          />
          <input
            type="password"
            value={gamePwNew}
            onChange={(e) => setGamePwNew(e.target.value)}
            placeholder="New game password"
            className="block w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500"
          />
          <button
            type="button"
            disabled={gamePwSaving || !currentGameId || !gamePwNew.trim()}
            onClick={async () => {
              setGamePwResult(null)
              setGamePwSaving(true)
              try {
                await updateGamePassword(currentGameId, gamePwCurrent, gamePwNew)
                setGamePwResult('Saved.')
                setGamePwCurrent('')
                setGamePwNew('')
              } catch (e) {
                setGamePwResult(e?.message || 'Failed')
              } finally {
                setGamePwSaving(false)
              }
            }}
            className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
          >
            {gamePwSaving ? 'Saving…' : 'Change game password'}
          </button>
        </div>
        {gamePwResult && (
          <p className="mt-2 text-sm text-slate-400">
            {gamePwResult === 'Saved.' ? gamePwResult : <span className="text-red-400">{gamePwResult}</span>}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Reset for new game</h3>
        <p className="text-xs text-slate-400">Clear all bracket and draft data so you can run a fresh draft (e.g. after testing). Teams stay; you can re-draft. Optionally clear players too.</p>
        {!resetConfirm ? (
          <button
            type="button"
            onClick={() => setResetConfirm(true)}
            className="mt-1 rounded border border-amber-600/60 bg-amber-900/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/40"
          >
            Reset for new game…
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={resetAlsoPlayers}
                onChange={(e) => setResetAlsoPlayers(e.target.checked)}
              />
              <span className="text-sm text-slate-300">Also clear players (empty roster for real game)</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setResetResult(null)
                  const r = await resetForNewGame(resetAlsoPlayers)
                  setResetResult(r)
                  setResetConfirm(false)
                  setResetAlsoPlayers(false)
                  if (r.ok) window.location.reload()
                }}
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500"
              >
                Yes, reset everything
              </button>
              <button
                type="button"
                onClick={() => { setResetConfirm(false); setResetAlsoPlayers(false); setResetResult(null); }}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
              >
                Cancel
              </button>
            </div>
            {resetResult && (
              <p className="text-sm text-slate-400">{resetResult.error ? resetResult.error : 'Reset complete. You can run a new draft.'}</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Finalize games</h3>
        <div className="mt-2 space-y-2">
          {inProgressGames.length === 0 && <p className="text-sm text-slate-400">No games in progress.</p>}
          {inProgressGames.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <GameMatchup
                game={g}
                team1={g.team1}
                team2={g.team2}
                spreadTeam={g.spread_team}
                score1={g.team1_score}
                score2={g.team2_score}
                status={g.status}
                isAdmin
                onFinalize={() => setFinalizeModal(g)}
              />
            </div>
          ))}
        </div>
      </section>

      {finalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-900 p-4">
            <h3 className="font-display text-slate-100">Finalize game</h3>
            <p className="mt-1 text-sm text-slate-400">
              {finalizeModal.team1?.name} vs {finalizeModal.team2?.name}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                placeholder={String(finalizeModal.team1_score ?? '')}
                value={overrideScores.team1}
                onChange={(e) => setOverrideScores((s) => ({ ...s, team1: e.target.value }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
              />
              <input
                type="number"
                placeholder={String(finalizeModal.team2_score ?? '')}
                value={overrideScores.team2}
                onChange={(e) => setOverrideScores((s) => ({ ...s, team2: e.target.value }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => handleFinalize(finalizeModal)}
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500"
              >
                Finalize
              </button>
              <button
                type="button"
                onClick={() => { setFinalizeModal(null); setOverrideScores({ team1: '', team2: '' }); }}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
