import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePlayerModal } from '../context/PlayerModalContext'

export function DraftBoard({ teams, players = [], ownership, draftLocked, onSubmitDraft, onAssign, onRevert, canRevert }) {
  const { openPlayerCard } = usePlayerModal()
  const [draggedTeam, setDraggedTeam] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)

  const getTeamOwner = (teamId) => {
    if (teamId == null || !ownership?.length) return null
    const id = String(teamId)
    return ownership.find((o) => String(o.team_id) === id)?.player ?? null
  }

  const handleDragStart = (e, team) => {
    if (draftLocked) return
    setDraggedTeam(team)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', team.id)
  }

  const handleDragOver = (e, playerId) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    if (draftLocked) return
    setDragOverSlot(playerId)
  }

  const handleDragLeave = () => setDragOverSlot(null)

  const handleDrop = (e, playerId) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSlot(null)
    if (!draggedTeam || draftLocked) return
    const teamId = draggedTeam.id
    if (onAssign) {
      onAssign(teamId, playerId)
    } else if (supabase) {
      supabase.from('sm_ownership').update({ is_active: false }).eq('team_id', teamId).then(() =>
        supabase.from('sm_ownership').insert({
          team_id: teamId,
          player_id: playerId,
          acquired_round: 1,
          is_active: true,
        })
      )
    }
    setDraggedTeam(null)
  }

  const byRegion = (teams || []).reduce((acc, t) => {
    if (!acc[t.region]) acc[t.region] = []
    acc[t.region].push(t)
    return acc
  }, {})
  const regions = Object.keys(byRegion).sort()

  return (
    <div className="space-y-6">
      {/* Player slots */}
      <div className="flex flex-wrap gap-4">
        {players.map((p) => (
          <div
            key={p.id}
            onDragEnter={(e) => { e.preventDefault(); handleDragOver(e, p.id) }}
            onDragOver={(e) => handleDragOver(e, p.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, p.id)}
            className={`
              min-w-[140px] rounded-xl border-2 p-3 transition-colors
              ${dragOverSlot === p.id ? 'border-amber-400 bg-amber-500/20' : 'border-slate-600 bg-slate-800/80'}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <button
                type="button"
                onClick={() => openPlayerCard(p)}
                className="font-body font-medium text-slate-200 hover:text-white hover:underline text-left"
              >
                {p.avatar_emoji} {p.name}
              </button>
            </div>
            <p className="mt-1 font-body text-xs text-slate-400">
              {ownership?.filter((o) => o.player_id === p.id).length ?? 0} teams
            </p>
          </div>
        ))}
      </div>

      {!draftLocked && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRevert}
            disabled={!canRevert}
            className="rounded-lg border border-slate-500 bg-slate-700 px-4 py-2 font-body font-medium text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-700"
          >
            Revert last move
          </button>
          <button
            type="button"
            onClick={onSubmitDraft}
            className="rounded-lg bg-emerald-600 px-4 py-2 font-body font-medium text-white hover:bg-emerald-500"
          >
            Submit Draft
          </button>
        </div>
      )}

      {/* Team grid by region */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {regions.map((region) => (
          <div key={region} className="rounded-lg border border-slate-600 bg-slate-900/60 p-3">
            <h3 className="font-display text-sm uppercase tracking-wide text-slate-400">{region}</h3>
            <div className="mt-2 flex flex-wrap gap-1">
              {(byRegion[region] || [])
                .sort((a, b) => a.seed - b.seed)
                .map((team) => {
                  const owner = getTeamOwner(team.id)
                  return (
                    <div
                      key={team.id}
                      draggable={!draftLocked && !owner}
                      onDragStart={(e) => !owner && handleDragStart(e, team)}
                      className={`
                        rounded border px-2 py-1 font-body text-xs
                        ${owner ? 'cursor-default border-slate-500 bg-slate-700/60 text-slate-200' : 'cursor-grab border-slate-600 bg-slate-800 text-slate-400'}
                        ${!draftLocked && !owner ? 'hover:bg-slate-700' : ''}
                      `}
                      style={owner ? { borderLeftColor: owner.color, borderLeftWidth: 3 } : {}}
                    >
                      {team.seed} {team.name}
                      {owner && ` → ${owner.avatar_emoji}`}
                    </div>
                  )
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
