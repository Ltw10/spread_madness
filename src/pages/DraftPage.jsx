import { useState, useEffect, useMemo } from 'react'
import { DraftBoard } from '../components/DraftBoard'
import { useGame } from '../context/GameContext'
import { useGameConfig } from '../hooks/useGameConfig'
import { usePlayers } from '../hooks/usePlayers'
import { useOwnership } from '../hooks/useOwnership'
import { supabase } from '../lib/supabase'

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

  useEffect(() => {
    if (!supabase) return
    supabase.from('sm_teams').select('*').order('region').order('seed').then(({ data }) => setTeams(data || []))
  }, [])

  const draftLocked = config.draft_locked === 'true'

  /** Display = DB ownership with player resolved for display */
  const displayOwnership = useMemo(() => {
    return (ownership || []).map((o) => ({
      ...o,
      player: o.player ?? players.find((p) => String(p.id) === String(o.player_id)) ?? null,
    }))
  }, [ownership, players])

  const handleAssignTeam = async (teamId, playerId) => {
    if (!supabase || !currentGameId || draftLocked) return
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
    } catch (err) {
      setAddError(err?.message || 'Failed to save pick.')
    } finally {
      setAssigningPick(false)
    }
  }

  const handleUnassignTeam = async (teamId) => {
    if (draftLocked || !supabase || !currentGameId) return
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

  const handleSubmitDraft = async () => {
    setAddError('')
    const playersList = players || []
    const ownershipList = ownership || []
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
            players={players}
            ownership={displayOwnership}
            draftLocked={draftLocked}
            assigningPick={assigningPick}
            onSubmitDraft={handleSubmitDraft}
            onAssign={draftLocked ? undefined : handleAssignTeam}
            onUnassign={draftLocked ? undefined : handleUnassignTeam}
          />
        </div>
      )}
    </div>
  )
}
