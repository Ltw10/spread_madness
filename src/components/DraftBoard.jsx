import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePlayerModal } from '../context/PlayerModalContext'

export function DraftBoard({ teams, players = [], ownership, draftLocked, onSubmitDraft, onAssign, onRevert, canRevert }) {
  const { openPlayerCard } = usePlayerModal()
  const [draggedTeam, setDraggedTeam] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)
  /** Mobile: tap a team to select it, then tap a player to assign (avoids drag on touch) */
  const [selectedTeamId, setSelectedTeamId] = useState(null)

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
    assignTeamToPlayer(draggedTeam.id, playerId)
    setDraggedTeam(null)
  }

  const assignTeamToPlayer = (teamId, playerId) => {
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
    setSelectedTeamId(null)
  }

  const handlePlayerSlotClick = (e, playerId) => {
    if (draftLocked) return
    if (selectedTeamId) {
      e.preventDefault()
      assignTeamToPlayer(selectedTeamId, playerId)
      return
    }
    openPlayerCard(players.find((p) => p.id === playerId))
  }

  const handleTeamClick = (e, team, owner) => {
    if (draftLocked || owner) return
    e.preventDefault()
    e.stopPropagation()
    setSelectedTeamId((prev) => (prev === team.id ? null : team.id))
  }

  const byRegion = (teams || []).reduce((acc, t) => {
    if (!acc[t.region]) acc[t.region] = []
    acc[t.region].push(t)
    return acc
  }, {})
  const regions = Object.keys(byRegion).sort()

  const selectedTeam = selectedTeamId && teams?.find((t) => t.id === selectedTeamId)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Tap hint when a team is selected (mobile-friendly) */}
      {!draftLocked && selectedTeam && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-500/15 px-4 py-3 text-center">
          <p className="font-body text-sm text-amber-200">
            Tap a player below to assign <strong>{selectedTeam.seed} {selectedTeam.name}</strong>
          </p>
          <button
            type="button"
            onClick={() => setSelectedTeamId(null)}
            className="mt-2 font-body text-xs text-amber-300 underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Player slots — larger touch targets on mobile */}
      <div className="flex flex-wrap gap-3 md:gap-4">
        {players.map((p) => (
          <div
            key={p.id}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (selectedTeamId) assignTeamToPlayer(selectedTeamId, p.id)
                else openPlayerCard(p)
              }
            }}
            onDragEnter={(e) => { e.preventDefault(); handleDragOver(e, p.id) }}
            onDragOver={(e) => handleDragOver(e, p.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, p.id)}
            onClick={(e) => handlePlayerSlotClick(e, p.id)}
            className={`
              min-h-[52px] min-w-[140px] rounded-xl border-2 p-3 transition-colors touch-manipulation
              md:min-h-0
              ${dragOverSlot === p.id ? 'border-amber-400 bg-amber-500/20' : 'border-slate-600 bg-slate-800/80'}
              ${selectedTeamId ? 'cursor-pointer active:bg-slate-700' : ''}
            `}
          >
            <div className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
              <span className="font-body font-medium text-slate-200">
                {p.avatar_emoji} {p.name}
              </span>
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
            className="min-h-[44px] touch-manipulation rounded-lg border border-slate-500 bg-slate-700 px-4 py-2.5 font-body font-medium text-slate-200 hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-700"
          >
            Revert last move
          </button>
          <button
            type="button"
            onClick={onSubmitDraft}
            className="min-h-[44px] touch-manipulation rounded-lg bg-emerald-600 px-4 py-2.5 font-body font-medium text-white hover:bg-emerald-500 active:bg-emerald-500"
          >
            Submit Draft
          </button>
        </div>
      )}

      {/* Team grid by region — larger tap targets on mobile */}
      <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {regions.map((region) => (
          <div key={region} className="rounded-lg border border-slate-600 bg-slate-900/60 p-3">
            <h3 className="font-display text-sm uppercase tracking-wide text-slate-400">{region}</h3>
            <div className="mt-2 flex flex-wrap gap-1.5 md:gap-1">
              {(byRegion[region] || [])
                .sort((a, b) => a.seed - b.seed)
                .map((team) => {
                  const owner = getTeamOwner(team.id)
                  const isSelected = selectedTeamId === team.id
                  const canAssign = !draftLocked && !owner
                  return (
                    <div
                      key={team.id}
                      role={canAssign ? 'button' : undefined}
                      tabIndex={canAssign ? 0 : undefined}
                      draggable={canAssign}
                      onDragStart={(e) => canAssign && handleDragStart(e, team)}
                      onClick={(e) => handleTeamClick(e, team, owner)}
                      onKeyDown={(e) => {
                        if (canAssign && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault()
                          setSelectedTeamId((prev) => (prev === team.id ? null : team.id))
                        }
                      }}
                      className={`
                        touch-manipulation rounded border px-2.5 py-2 font-body text-xs
                        md:px-2 md:py-1
                        ${owner ? 'cursor-default border-slate-500 bg-slate-700/60 text-slate-200' : 'cursor-grab border-slate-600 bg-slate-800 text-slate-400'}
                        ${canAssign ? 'active:bg-slate-600 hover:bg-slate-700' : ''}
                        ${isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-900' : ''}
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
