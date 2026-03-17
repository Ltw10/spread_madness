import { useState } from 'react'
import { usePlayerModal } from '../context/PlayerModalContext'

export function DraftBoard({ teams, players = [], ownership, draftLocked, assigningPick, onSubmitDraft, onAssign, onUnassign }) {
  const { openPlayerCard } = usePlayerModal()
  /** When set, the "assign team to player" modal is open; user picks a player from the modal */
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  /** When set, the "unassign team" modal is open; { team, owner } */
  const [teamToUnassign, setTeamToUnassign] = useState(null)

  const getTeamOwner = (teamId) => {
    if (teamId == null || !ownership?.length) return null
    const id = String(teamId)
    return ownership.find((o) => String(o.team_id) === id)?.player ?? null
  }

  const assignTeamToPlayer = (teamId, playerId) => {
    if (onAssign) onAssign(teamId, playerId)
    setSelectedTeamId(null)
  }

  const handleTeamClick = (e, team, owner) => {
    if (draftLocked) return
    e.preventDefault()
    e.stopPropagation()
    if (owner) {
      if (onUnassign) setTeamToUnassign({ team, owner })
      return
    }
    setSelectedTeamId((prev) => (String(prev) === String(team.id) ? null : team.id))
  }

  const byRegion = (teams || []).reduce((acc, t) => {
    if (!acc[t.region]) acc[t.region] = []
    acc[t.region].push(t)
    return acc
  }, {})
  const regions = Object.keys(byRegion).sort()

  const selectedTeam = selectedTeamId && teams?.find((t) => String(t.id) === String(selectedTeamId))

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Unassign-team modal: confirm removing team from player */}
      {teamToUnassign && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            aria-hidden
            onClick={() => setTeamToUnassign(null)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 shadow-xl p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unassign-modal-title"
          >
            <h2 id="unassign-modal-title" className="font-display text-lg text-slate-100 mb-1">
              Unassign team
            </h2>
            <p className="font-body text-sm text-slate-300 mb-4">
              Remove <strong>{teamToUnassign.team.seed} {teamToUnassign.team.name}</strong> from {teamToUnassign.owner.avatar_emoji} {teamToUnassign.owner.name}? The team will be available to assign to someone else.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (onUnassign) onUnassign(teamToUnassign.team.id)
                  setTeamToUnassign(null)
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 font-body font-medium text-white hover:bg-red-500"
              >
                Unassign
              </button>
              <button
                type="button"
                onClick={() => setTeamToUnassign(null)}
                className="flex-1 rounded-lg border border-slate-500 bg-slate-700 py-2.5 font-body text-slate-200 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Assign-team modal: when a team is selected, pick a player from this list */}
      {!draftLocked && selectedTeam && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            aria-hidden
            onClick={() => setSelectedTeamId(null)}
          />
          <div
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 shadow-xl p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assign-modal-title"
          >
            <h2 id="assign-modal-title" className="font-display text-lg text-slate-100 mb-1">
              Assign team to player
            </h2>
            <p className="font-body text-sm text-amber-200 mb-4">
              <strong>{selectedTeam.seed} {selectedTeam.name}</strong>
              {assigningPick && <span className="ml-2 text-slate-400">Saving…</span>}
            </p>
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
              {players.map((p) => {
                const teamCount = ownership?.filter((o) => String(o.player_id) === String(p.id)).length ?? 0
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => assignTeamToPlayer(selectedTeamId, p.id)}
                      disabled={assigningPick}
                      className="w-full flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-3 text-left font-body text-slate-200 hover:bg-slate-700 active:bg-slate-600 touch-manipulation min-h-[48px] disabled:opacity-60"
                    >
                      <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                      <span>{p.avatar_emoji} {p.name}</span>
                      <span className="ml-auto font-body text-xs text-slate-500">{teamCount} teams</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <button
              type="button"
              onClick={() => setSelectedTeamId(null)}
              className="mt-4 w-full rounded-lg border border-slate-500 bg-slate-700 py-2.5 font-body text-slate-200 hover:bg-slate-600"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Player boxes — view only; tap name to see their drafted teams */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-3 md:gap-4 lg:grid-cols-3">
        {players.map((p) => {
          const teamCount = ownership?.filter((o) => String(o.player_id) === String(p.id)).length ?? 0
          return (
            <div
              key={p.id}
              className="flex min-h-[72px] flex-col justify-center rounded-xl border-2 border-slate-600 bg-slate-800/80 p-4"
            >
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                <button
                  type="button"
                  onClick={() => openPlayerCard(p)}
                  className="font-body font-medium text-slate-200 underline decoration-slate-500 underline-offset-2 hover:text-white hover:decoration-slate-400 text-left"
                >
                  {p.avatar_emoji} {p.name}
                </button>
              </div>
              <p className="mt-1 font-body text-xs text-slate-400">
                {teamCount} team{teamCount !== 1 ? 's' : ''} — tap name to view
              </p>
            </div>
          )
        })}
      </div>

      {!draftLocked && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSubmitDraft}
            className="min-h-[44px] touch-manipulation rounded-lg bg-amber-600 px-4 py-2.5 font-body font-medium text-white hover:bg-amber-500 active:bg-amber-500"
          >
            Submit draft
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
                  const isSelected = String(selectedTeamId) === String(team.id)
                  const canAssign = !draftLocked && !owner
                  const canUnassign = !draftLocked && !!owner && !!onUnassign
                  const isClickable = canAssign || canUnassign
                  return (
                    <div
                      key={team.id}
                      role={isClickable ? 'button' : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={(e) => handleTeamClick(e, team, owner)}
                      onKeyDown={(e) => {
                        if (!isClickable) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          if (canAssign) setSelectedTeamId((prev) => (String(prev) === String(team.id) ? null : team.id))
                          else if (canUnassign) setTeamToUnassign({ team, owner })
                        }
                      }}
                      className={`
                        touch-manipulation rounded border px-2.5 py-2 font-body text-xs
                        md:px-2 md:py-1
                        ${owner ? 'border-slate-500 bg-slate-700/60 text-slate-200' : 'border-slate-600 bg-slate-800 text-slate-400'}
                        ${isClickable ? 'cursor-pointer' : 'cursor-default'}
                        ${canAssign ? 'active:bg-slate-600 hover:bg-slate-700' : ''}
                        ${canUnassign ? 'hover:bg-slate-600/80 active:bg-slate-600' : ''}
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

      {/* Draft board: ordered list of picks (player → team) at bottom of page */}
      <section className="rounded-xl border border-slate-600 bg-slate-900/60 p-4">
        <h3 className="font-display text-sm uppercase tracking-wide text-slate-400 mb-3">Draft board</h3>
        {(() => {
          const ordered = [...(ownership || [])]
            .filter((o) => o.player && o.team)
            .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
          if (ordered.length === 0) {
            return <p className="font-body text-sm text-slate-500">No picks yet.</p>
          }
          return (
            <ol className="list-decimal list-inside space-y-1.5 font-body text-sm text-slate-200">
              {ordered.map((o, i) => (
                <li key={o.team_id ?? o.id ?? i} className="flex items-center gap-2">
                  <span className="shrink-0 w-6 text-slate-500">{i + 1}.</span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: o.player?.color }} />
                    <span>{o.player?.avatar_emoji} {o.player?.name}</span>
                  </span>
                  <span className="text-slate-500">→</span>
                  <span className="text-slate-300">{o.team?.seed} {o.team?.name}</span>
                </li>
              ))}
            </ol>
          )
        })()}
      </section>
    </div>
  )
}
