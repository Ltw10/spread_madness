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
  const [draftAssignments, setDraftAssignments] = useState([])
  const [assignmentHistory, setAssignmentHistory] = useState([])

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

  useEffect(() => {
    if (draftLocked || ownershipLoading || !ownership?.length) return
    setDraftAssignments((prev) =>
      prev.length === 0 ? ownership.map((o) => ({ team_id: o.team_id, player_id: o.player_id })) : prev
    )
  }, [draftLocked, ownershipLoading, ownership])

  const displayOwnership = useMemo(() => {
    if (draftLocked) return ownership
    return draftAssignments.map(({ team_id, player_id }) => ({
      team_id,
      player_id,
      player: players.find((p) => p.id === player_id) || null,
    }))
  }, [draftLocked, ownership, draftAssignments, players])

  const handleAssignTeam = (teamId, playerId) => {
    setAssignmentHistory((h) => [...h, draftAssignments.map((a) => ({ ...a }))])
    setDraftAssignments((prev) => {
      const rest = prev.filter((a) => a.team_id !== teamId)
      return [...rest, { team_id: teamId, player_id: playerId }]
    })
  }

  const handleRevert = () => {
    setAssignmentHistory((h) => {
      if (h.length === 0) return h
      const previousAssignments = h[h.length - 1]
      setDraftAssignments(previousAssignments)
      return h.slice(0, -1)
    })
  }

  const handleSubmitDraft = async () => {
    setAddError('')
    const teamIds = (teams || []).map((t) => t.id)
    const assignedSet = new Set(draftAssignments.map((a) => a.team_id))
    const allAssigned = teamIds.length > 0 && teamIds.every((id) => assignedSet.has(id))
    if (!allAssigned) {
      setAddError('Assign every team to a player before submitting.')
      return
    }
    if (!supabase) return
    try {
      for (const { team_id } of draftAssignments) {
        await supabase.from('sm_ownership').update({ is_active: false }).eq('team_id', team_id)
      }
      if (draftAssignments.length > 0) {
        await supabase.from('sm_ownership').insert(
          draftAssignments.map(({ team_id, player_id }) => ({
            team_id,
            player_id,
            acquired_round: 1,
            is_active: true,
          }))
        )
      }
      await supabase.from('sm_config').upsert({ key: 'draft_locked', value: 'true', updated_at: new Date().toISOString() }, { onConflict: 'key' })
      setConfig((c) => ({ ...c, draft_locked: 'true' }))
      await reloadOwnership()
    } catch (err) {
      setAddError(err?.message || 'Failed to submit draft.')
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
      <p className="mt-1 font-body text-slate-400">Drag teams onto players. Submit when every team is assigned.</p>

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
            onSubmitDraft={handleSubmitDraft}
            onAssign={draftLocked ? undefined : handleAssignTeam}
            onRevert={handleRevert}
            canRevert={!draftLocked && assignmentHistory.length > 0}
          />
        </div>
      )}
    </div>
  )
}
