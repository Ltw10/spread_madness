import { useState, useEffect, useMemo } from 'react'
import { DraftBoard } from '../components/DraftBoard'
import { usePlayers } from '../hooks/usePlayers'
import { useOwnership } from '../hooks/useOwnership'
import { supabase } from '../lib/supabase'

export function DraftPage() {
  const { players, addPlayer, loading: playersLoading } = usePlayers()
  const { ownership, loading: ownershipLoading, reload: reloadOwnership } = useOwnership()
  const [teams, setTeams] = useState([])
  const [config, setConfig] = useState({})
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6366f1')
  const [newEmoji, setNewEmoji] = useState('🏀')
  const [addError, setAddError] = useState('')
  /** When not locked: one unsaved pick. Submitting it writes to DB so others see it. */
  const [pendingPick, setPendingPick] = useState(null)
  const [submittingPick, setSubmittingPick] = useState(false)

  useEffect(() => {
    if (!supabase) return
    supabase.from('sm_teams').select('*').order('region').order('seed').then(({ data }) => setTeams(data || []))
    supabase.from('sm_config').select('key, value').then(({ data }) => {
      const map = {}
      ;(data || []).forEach((r) => { map[r.key] = r.value })
      setConfig(map)
    })
  }, [])

  const draftLocked = config.draft_locked === 'true'

  /** Display = DB ownership + pending pick (so unsaved pick shows until Submit pick). */
  const displayOwnership = useMemo(() => {
    const base = (ownership || []).map((o) => ({
      ...o,
      player: o.player ?? players.find((p) => String(p.id) === String(o.player_id)) ?? null,
    }))
    if (draftLocked || !pendingPick) return base
    const without = base.filter((o) => String(o.team_id) !== String(pendingPick.teamId))
    const player = players.find((p) => String(p.id) === String(pendingPick.playerId)) ?? null
    return [...without, { team_id: pendingPick.teamId, player_id: pendingPick.playerId, player }]
  }, [draftLocked, ownership, players, pendingPick])

  const handleAssignTeam = (teamId, playerId) => {
    setPendingPick({ teamId, playerId })
  }

  const handleRevertPending = () => {
    setPendingPick(null)
  }

  const handleSubmitPick = async () => {
    if (!pendingPick || !supabase) return
    setAddError('')
    setSubmittingPick(true)
    try {
      await supabase.from('sm_ownership').update({ is_active: false }).eq('team_id', pendingPick.teamId)
      await supabase.from('sm_ownership').insert({
        team_id: pendingPick.teamId,
        player_id: pendingPick.playerId,
        acquired_round: 1,
        is_active: true,
      })
      await reloadOwnership()
      setPendingPick(null)
    } catch (err) {
      setAddError(err?.message || 'Failed to save pick.')
    } finally {
      setSubmittingPick(false)
    }
  }

  const handleSubmitDraft = async () => {
    setAddError('')
    if (pendingPick) {
      setAddError('Submit your current pick first, or cancel it.')
      return
    }
    const teamIds = (teams || []).map((t) => t.id)
    const assignedSet = new Set((ownership || []).map((o) => o.team_id))
    const allAssigned = teamIds.length > 0 && teamIds.every((id) => assignedSet.has(id))
    if (!allAssigned) {
      setAddError('Every team must be assigned to a player before locking the draft.')
      return
    }
    if (!supabase) return
    try {
      await supabase.from('sm_config').upsert({ key: 'draft_locked', value: 'true', updated_at: new Date().toISOString() }, { onConflict: 'key' })
      setConfig((c) => ({ ...c, draft_locked: 'true' }))
      await reloadOwnership()
    } catch (err) {
      setAddError(err?.message || 'Failed to lock draft.')
    }
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
      <p className="mt-1 font-body text-slate-400">Assign teams to players, then Submit pick to save so others can see. Lock the draft when every team is assigned.</p>

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

      {(playersLoading || ownershipLoading) ? (
        <p className="mt-6 text-slate-400">Loading…</p>
      ) : (
        <div className="mt-8">
          <DraftBoard
            teams={teams}
            players={players}
            ownership={displayOwnership}
            draftLocked={draftLocked}
            pendingPick={pendingPick}
            onSubmitPick={handleSubmitPick}
            submittingPick={submittingPick}
            onSubmitDraft={handleSubmitDraft}
            onAssign={draftLocked ? undefined : handleAssignTeam}
            onRevertPending={handleRevertPending}
            canRevertPending={!!pendingPick}
          />
        </div>
      )}
    </div>
  )
}
