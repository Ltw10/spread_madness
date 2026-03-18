import { useState, useEffect, useMemo } from 'react'
import { DraftBoard } from '../components/DraftBoard'
import { useGame } from '../context/GameContext'
import { useGameConfig } from '../hooks/useGameConfig'
import { usePlayers } from '../hooks/usePlayers'
import { useOwnership } from '../hooks/useOwnership'
import { supabase } from '../lib/supabase'
import { verifyPassword } from '../lib/passwordHash'

/** Snake: asc = 1→N by slot index, desc = N→1. After last of asc, same player (N) picks first in desc. */
function advanceDraftTurn(phase, index, n) {
  if (n <= 1) return { phase: 'asc', index: 0 }
  if (phase === 'asc') {
    if (index < n - 1) return { phase: 'asc', index: index + 1 }
    return { phase: 'desc', index: n - 1 }
  }
  if (index > 0) return { phase: 'desc', index: index - 1 }
  return { phase: 'asc', index: 0 }
}

export function DraftPage() {
  const { currentGameId } = useGame()
  const { config, setConfigValue } = useGameConfig(currentGameId)
  const { players, addPlayer, loading: playersLoading } = usePlayers()
  const { ownership, loading: ownershipLoading, reload: reloadOwnership } = useOwnership()
  const [teams, setTeams] = useState([])
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newEmoji, setNewEmoji] = useState('🏀')
  const [addError, setAddError] = useState('')
  const [assigningPick, setAssigningPick] = useState(false)
  const [showUnassignedConfirm, setShowUnassignedConfirm] = useState(false)
  const [adminMode, setAdminMode] = useState(false)
  const [adminPwModalOpen, setAdminPwModalOpen] = useState(false)
  const [adminPwValue, setAdminPwValue] = useState('')
  const [adminPwError, setAdminPwError] = useState('')
  const [adminPwSaving, setAdminPwSaving] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.from('sm_teams').select('*').order('region').order('seed').then(({ data }) => setTeams(data || []))
  }, [])

  const draftLocked = config.draft_locked === 'true'

  const draftOwnership = useMemo(() => {
    // Only count ownership created during the draft (acquired_round = 1).
    return (ownership || []).filter((o) => o.acquired_round === 1)
  }, [ownership])

  /** Display ownership for the draft screen (draft-stage only). */
  const displayOwnership = useMemo(() => {
    return (draftOwnership || []).map((o) => ({
      ...o,
      player: o.player ?? players.find((p) => String(p.id) === String(o.player_id)) ?? null,
    }))
  }, [draftOwnership, players])

  const draftOrderIds = useMemo(() => {
    if (!config?.draft_order) return null
    try {
      const parsed = JSON.parse(config.draft_order)
      if (Array.isArray(parsed)) return parsed
    } catch (e) {}
    return null
  }, [config?.draft_order])

  const playersOrdered = useMemo(() => {
    const defaultIds = (players || []).map((p) => p.id)
    const ids = (draftOrderIds && draftOrderIds.length > 0) ? draftOrderIds : defaultIds
    const ordered = ids
      .map((id) => players.find((p) => String(p.id) === String(id)))
      .filter(Boolean)

    // If admin order doesn't include some players, append the missing ones.
    const orderedIdSet = new Set(ordered.map((p) => String(p.id)))
    const remaining = (players || []).filter((p) => !orderedIdSet.has(String(p.id)))
    return [...ordered, ...remaining]
  }, [players, draftOrderIds])

  const draftPickCount = displayOwnership.length

  const computedTurnPlayer = useMemo(() => {
    const n = playersOrdered.length
    if (!n) return null

    const roundIndex = Math.floor(draftPickCount / n) // 0 = round 1
    const posInRound = draftPickCount % n

    // `draft_direction` is interpreted relative to the round where the admin set it.
    // This avoids surprising jumps if direction is changed mid-draft.
    const direction = config?.draft_direction
    const anchorRoundRaw = config?.draft_direction_anchor_round
    const anchorRound = Number.isFinite(Number(anchorRoundRaw)) ? Number(anchorRoundRaw) : 0

    const directionIsAscending = direction !== 'high_to_low' // low_to_high => ascending
    const diffParity = ((roundIndex - anchorRound) % 2 + 2) % 2
    const ascendingWanted = diffParity === 0 ? directionIsAscending : !directionIsAscending

    const idx = ascendingWanted ? posInRound : (n - 1 - posInRound)
    return playersOrdered[idx] ?? null
  }, [playersOrdered, draftPickCount, config?.draft_direction, config?.draft_direction_anchor_round])

  const explicitPhase = config?.draft_turn_phase
  const explicitIndexParsed = parseInt(String(config?.draft_turn_index ?? ''), 10)

  const turnFromExplicitState = useMemo(() => {
    const n = playersOrdered.length
    if (!n) return null
    if (explicitPhase !== 'asc' && explicitPhase !== 'desc') return null
    if (!Number.isFinite(explicitIndexParsed) || explicitIndexParsed < 0 || explicitIndexParsed >= n) return null
    return playersOrdered[explicitIndexParsed] ?? null
  }, [playersOrdered, explicitPhase, explicitIndexParsed])

  // Admin-set turn + direction (persisted). Otherwise classic snake from pick count.
  const currentTurnPlayer = turnFromExplicitState ?? computedTurnPlayer

  const adminPickSelectValue =
    turnFromExplicitState?.id != null ? String(turnFromExplicitState.id) : ''

  const lastPickedTeamId = useMemo(() => {
    if (!displayOwnership?.length) return null
    const ordered = [...displayOwnership].sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    return ordered[ordered.length - 1]?.team_id ?? null
  }, [displayOwnership])

  const handlePickTeam = async (teamId) => {
    if (!supabase || !currentGameId || draftLocked || !currentTurnPlayer) return
    setAddError('')
    setAssigningPick(true)
    try {
      await supabase
        .from('sm_ownership')
        .update({ is_active: false })
        .eq('game_instance_id', currentGameId)
        .eq('team_id', teamId)
      await supabase.from('sm_ownership').insert({
        game_instance_id: currentGameId,
        team_id: teamId,
        player_id: currentTurnPlayer.id,
        acquired_round: 1,
        is_active: true,
      })
      await reloadOwnership()
      const n = playersOrdered.length
      if (n > 0 && (config?.draft_turn_phase === 'asc' || config?.draft_turn_phase === 'desc')) {
        const idx = parseInt(String(config?.draft_turn_index ?? '0'), 10)
        const next = advanceDraftTurn(config.draft_turn_phase, Number.isFinite(idx) ? idx : 0, n)
        await setConfigValue('draft_turn_phase', next.phase)
        await setConfigValue('draft_turn_index', String(next.index))
      }
      await setConfigValue('draft_current_player_id', '')
    } catch (err) {
      setAddError(err?.message || 'Failed to save pick.')
    } finally {
      setAssigningPick(false)
    }
  }

  const handleUnassignTeam = async (teamId) => {
    if (draftLocked || !supabase || !currentGameId) return
    if (lastPickedTeamId != null && String(teamId) !== String(lastPickedTeamId)) return
    setAddError('')
    try {
      await supabase
        .from('sm_ownership')
        .update({ is_active: false })
        .eq('game_instance_id', currentGameId)
        .eq('team_id', teamId)
      await reloadOwnership()
    } catch (err) {
      setAddError(err?.message || 'Failed to unassign team.')
    }
  }

  const handleAdminPickTeam = async (teamId, playerId) => {
    if (!supabase || !currentGameId || !adminMode) return
    setAddError('')
    setAssigningPick(true)
    try {
      await supabase
        .from('sm_ownership')
        .update({ is_active: false })
        .eq('game_instance_id', currentGameId)
        .eq('team_id', teamId)
      await supabase.from('sm_ownership').insert({
        game_instance_id: currentGameId,
        team_id: teamId,
        player_id: playerId,
        acquired_round: 1,
        is_active: true,
      })
      await reloadOwnership()
      await setConfigValue('draft_current_player_id', '')
    } catch (err) {
      setAddError(err?.message || 'Failed to save admin pick.')
    } finally {
      setAssigningPick(false)
    }
  }

  const handleAdminUnassignTeam = async (teamId) => {
    if (!supabase || !currentGameId || !adminMode) return
    setAddError('')
    try {
      await supabase
        .from('sm_ownership')
        .update({ is_active: false })
        .eq('game_instance_id', currentGameId)
        .eq('team_id', teamId)
      await reloadOwnership()
    } catch (err) {
      setAddError(err?.message || 'Failed to unassign team (admin).')
    }
  }

  const lockDraft = async () => {
    if (!currentGameId) return
    setAddError('')
    try {
      await setConfigValue('draft_locked', 'true')
      await reloadOwnership()
      setShowUnassignedConfirm(false)
    } catch (err) {
      setAddError(err?.message || 'Failed to lock draft.')
    }
  }

  const setCurrentPickOverride = async (playerIdOrNull) => {
    if (!currentGameId) return
    setAddError('')
    try {
      if (!playerIdOrNull) {
        await setConfigValue('draft_turn_phase', '')
        await setConfigValue('draft_turn_index', '')
        await setConfigValue('draft_current_player_id', '')
        return
      }
      const idx = playersOrdered.findIndex((p) => String(p.id) === String(playerIdOrNull))
      if (idx < 0) return
      const dir = config?.draft_direction === 'high_to_low' ? 'high_to_low' : 'low_to_high'
      const phase = dir === 'low_to_high' ? 'asc' : 'desc'
      await setConfigValue('draft_direction', dir)
      await setConfigValue('draft_turn_phase', phase)
      await setConfigValue('draft_turn_index', String(idx))
      await setConfigValue('draft_current_player_id', '')
    } catch (err) {
      setAddError(err?.message || 'Failed to set current pick override.')
    }
  }

  const setDraftDirection = async (direction) => {
    if (!currentGameId) return
    setAddError('')
    const v = direction === 'high_to_low' ? 'high_to_low' : 'low_to_high'
    try {
      await setConfigValue('draft_direction', v)
      const phase = config?.draft_turn_phase
      const idx = parseInt(String(config?.draft_turn_index ?? ''), 10)
      const n = playersOrdered.length
      if ((phase === 'asc' || phase === 'desc') && n > 0 && Number.isFinite(idx) && idx >= 0 && idx < n) {
        const newPhase = v === 'low_to_high' ? 'asc' : 'desc'
        await setConfigValue('draft_turn_phase', newPhase)
      } else {
        const anchorRoundIndex = Math.floor(draftPickCount / (n || 1))
        await setConfigValue('draft_direction_anchor_round', String(anchorRoundIndex))
      }
    } catch (err) {
      setAddError(err?.message || 'Failed to set draft direction.')
    }
  }

  const handleSubmitDraft = async () => {
    setAddError('')
    const playersList = players || []
    const ownershipList = draftOwnership || []
    const teamIds = (teams || []).map((t) => t.id)

    if (playersList.length === 0) {
      setAddError('Add at least one player before submitting the draft.')
      return
    }

    const countByPlayer = new Map()
    for (const p of playersList) {
      countByPlayer.set(String(p.id), 0)
    }
    for (const o of ownershipList) {
      const pid = String(o.player_id)
      if (countByPlayer.has(pid)) countByPlayer.set(pid, countByPlayer.get(pid) + 1)
    }
    const counts = [...countByPlayer.values()]
    const first = counts[0]
    const allSame = counts.length > 0 && counts.every((c) => c === first)

    if (!allSame) {
      setAddError('Each player must have the same number of teams before submitting the draft.')
      return
    }

    const assignedSet = new Set(ownershipList.map((o) => o.team_id))
    const allAssigned = teamIds.length > 0 && teamIds.every((id) => assignedSet.has(id))

    if (allAssigned) {
      await lockDraft()
      return
    }

    setShowUnassignedConfirm(true)
  }

  const handleAddPlayer = async (e) => {
    e.preventDefault()
    setAddError('')
    if (!newName.trim()) {
      setAddError('Enter a player name.')
      return
    }
    try {
      await addPlayer(newName.trim(), newColor, newEmoji.trim() || '🏀')
      setNewName('')
      setNewEmoji('🏀')
    } catch (err) {
      setAddError(err?.message || 'Failed to add player.')
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <h1 className="font-display text-3xl tracking-wide text-white">Draft</h1>
      <p className="mt-1 font-body text-slate-400">Tap a team to assign it to a player; the pick is saved immediately. Each player must have the same number of teams. Submit the draft when ready; unassigned teams can still advance and eliminate player teams.</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (adminMode) {
              setAdminMode(false)
              setAdminPwModalOpen(false)
              setAdminPwValue('')
              setAdminPwError('')
              return
            }
            setAdminPwModalOpen(true)
            setAdminPwError('')
            setAdminPwValue('')
          }}
          className="rounded bg-slate-700 px-3 py-2 font-body text-sm text-slate-200 hover:bg-slate-600 touch-manipulation"
        >
          Admin Override
        </button>
      </div>

      {adminMode && playersOrdered?.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-body text-sm text-slate-300">Current pick player:</span>
            <select
              value={adminPickSelectValue}
              onChange={(e) => setCurrentPickOverride(e.target.value || null)}
              className="rounded border border-slate-600 bg-slate-900/40 px-3 py-2 font-body text-slate-200"
            >
              <option value="">Auto (snake)</option>
              {playersOrdered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.avatar_emoji} {p.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setCurrentPickOverride(null)}
              className="rounded bg-slate-700 px-3 py-2 font-body text-sm text-slate-200 hover:bg-slate-600 touch-manipulation"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <span className="font-body text-sm text-slate-300">Draft direction:</span>
            <select
              value={config?.draft_direction === 'high_to_low' ? 'high_to_low' : 'low_to_high'}
              onChange={(e) => setDraftDirection(e.target.value)}
              className="rounded border border-slate-600 bg-slate-900/40 px-3 py-2 font-body text-slate-200"
            >
              <option value="low_to_high">Low to high (1 -> N)</option>
              <option value="high_to_low">High to low (N -> 1)</option>
            </select>
          </div>
        </div>
      )}

      {adminPwModalOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" aria-hidden onClick={() => setAdminPwModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 p-4 shadow-xl">
            <h2 className="font-display text-lg text-slate-100 mb-1">Admin verification</h2>
            <p className="font-body text-sm text-slate-400 mb-3">Enter the admin password to reassign/unassign teams on this draft.</p>
            <input
              type="password"
              value={adminPwValue}
              onChange={(e) => setAdminPwValue(e.target.value)}
              placeholder="Admin password"
              className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 font-body text-slate-200 placeholder-slate-500"
              autoFocus
            />
            {adminPwError && <p className="mt-2 text-sm text-red-400">{adminPwError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={adminPwSaving || !adminPwValue.trim()}
                onClick={async () => {
                  if (!supabase || !currentGameId) return
                  setAdminPwSaving(true)
                  setAdminPwError('')
                  try {
                    const { data } = await supabase
                      .from('sm_config')
                      .select('value')
                      .eq('key', 'admin_password_hash')
                      .maybeSingle()
                    const hash = data?.value ?? ''
                    const valid = hash ? await verifyPassword(adminPwValue, hash) : adminPwValue === 'admin'
                    if (!valid) throw new Error('Wrong admin password')
                    setAdminMode(true)
                    setAdminPwModalOpen(false)
                    setAdminPwValue('')
                  } catch (e) {
                    setAdminPwError(e?.message || 'Verification failed')
                  } finally {
                    setAdminPwSaving(false)
                  }
                }}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 font-body font-medium text-white hover:bg-amber-500 disabled:opacity-60"
              >
                {adminPwSaving ? 'Verifying…' : 'Unlock editing'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdminPwModalOpen(false)
                  setAdminPwError('')
                  setAdminPwValue('')
                }}
                className="flex-1 rounded-lg border border-slate-500 bg-slate-700 py-2.5 font-body text-slate-200 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <form onSubmit={handleAddPlayer} className="mt-6 flex flex-wrap items-end gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Player name"
          className="rounded border border-slate-600 bg-slate-800 px-3 py-2 font-body text-slate-200 placeholder-slate-500"
        />
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs text-slate-500">Emoji</span>
          <input
            type="text"
            value={newEmoji}
            onChange={(e) => setNewEmoji(e.target.value)}
            placeholder="🏀"
            maxLength={4}
            className="h-10 w-12 rounded border border-slate-600 bg-slate-800 px-2 py-2 text-center text-xl font-body text-slate-200"
            title="Pick an emoji for this player"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-body text-xs text-slate-500">Color</span>
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-10 w-14 cursor-pointer rounded border border-slate-600"
          />
        </label>
        <button type="submit" className="rounded bg-emerald-600 px-4 py-2 font-body text-white hover:bg-emerald-500">
          Add player
        </button>
      </form>
      {addError && <p className="mt-2 text-sm text-red-400">{addError}</p>}

      {/* Confirm submit with unassigned teams */}
      {showUnassignedConfirm && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            aria-hidden
            onClick={() => setShowUnassignedConfirm(false)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unassigned-submit-title"
          >
            <h2 id="unassigned-submit-title" className="font-display text-lg text-slate-100 mb-1">
              Not all teams are assigned
            </h2>
            <p className="font-body text-sm text-slate-300 mb-4">
              Unassigned teams can still advance in the bracket and eliminate player teams. Do you want to continue and submit the draft?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={lockDraft}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 font-body font-medium text-white hover:bg-amber-500"
              >
                Continue and submit
              </button>
              <button
                type="button"
                onClick={() => setShowUnassignedConfirm(false)}
                className="flex-1 rounded-lg border border-slate-500 bg-slate-700 py-2.5 font-body text-slate-200 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {(playersLoading || ownershipLoading) ? (
        <p className="mt-6 text-slate-400">Loading…</p>
      ) : (
        <div className="mt-8">
          <DraftBoard
            teams={teams}
            players={playersOrdered}
            ownership={displayOwnership}
            draftLocked={draftLocked}
            assigningPick={assigningPick}
            currentTurnPlayer={currentTurnPlayer}
            onSubmitDraft={handleSubmitDraft}
            onPickTeam={draftLocked ? undefined : handlePickTeam}
            onUnassign={draftLocked ? undefined : handleUnassignTeam}
            adminMode={adminMode}
            onAdminPickTeam={adminMode ? handleAdminPickTeam : undefined}
            onAdminUnassign={adminMode ? handleAdminUnassignTeam : undefined}
            lastPickedTeamId={lastPickedTeamId}
          />
        </div>
      )}
    </div>
  )
}
