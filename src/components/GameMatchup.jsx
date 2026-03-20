import { usePlayerModal } from '../context/PlayerModalContext'
import { useOwnership } from '../hooks/useOwnership'

export function GameMatchup({ game, team1, team2, spreadTeam, owner1, owner2, score1, score2, status, onFinalize, isAdmin }) {
  const { openPlayerCard } = usePlayerModal()
  const { getOwnerByTeamId, getDraftOwnerByTeamId, getOwnerAtBracketRoundStart } = useOwnership()
  /** Each column uses ownership at the *start* of that round (draft for R64; then prior-round steals applied). */
  const round = Number(game?.round)
  const pickOwner = (teamId) => {
    if (teamId == null) return null
    if (round === 1) return getDraftOwnerByTeamId(teamId) ?? getOwnerByTeamId(teamId)
    if (round >= 2) return getOwnerAtBracketRoundStart(teamId, round) ?? getOwnerByTeamId(teamId)
    return getOwnerByTeamId(teamId)
  }
  const o1 = owner1 ?? (team1 ? pickOwner(team1.id) : null)
  const o2 = owner2 ?? (team2 ? pickOwner(team2.id) : null)

  const team1Label = team1 ? (team1.seed != null ? `${team1.seed} ${team1.name}` : team1.name) : 'TBD'
  const team2Label = team2 ? (team2.seed != null ? `${team2.seed} ${team2.name}` : team2.name) : 'TBD'

  const spreadNum = game?.spread != null ? Number(game.spread) : null
  const isLive = status === 'in_progress'
  const isFinal = status === 'final'
  const winnerId = game?.winner_team_id ?? game?.winner_team?.id ?? null
  const coverId = game?.cover_team_id ?? game?.cover_team?.id ?? null
  const t1Key = team1?.id != null ? String(team1.id) : null
  const t2Key = team2?.id != null ? String(team2.id) : null
  const wKey = winnerId != null ? String(winnerId) : null
  const cKey = coverId != null ? String(coverId) : null
  const team1Won = isFinal && wKey && t1Key && wKey === t1Key
  const team2Won = isFinal && wKey && t2Key && wKey === t2Key
  const team1Covered = isFinal && cKey && t1Key && cKey === t1Key
  const team2Covered = isFinal && cKey && t2Key && cKey === t2Key
  const spreadLabel =
    spreadNum != null && spreadTeam?.name
      ? `${spreadTeam.name} ${spreadNum > 0 ? '+' : ''}${spreadNum}`
      : spreadNum != null
        ? `${spreadNum > 0 ? '+' : ''}${spreadNum}`
        : null
  // Top-right: LIVE (in progress) or FINAL (completed); scheduled stays empty.
  const statusCornerLabel = isLive ? 'LIVE' : isFinal ? 'FINAL' : null

  const n1 = Number(score1)
  const n2 = Number(score2)
  const hasNumericScores = Number.isFinite(n1) && Number.isFinite(n2)
  const showAdminFinalize =
    isAdmin &&
    onFinalize &&
    (isLive ||
      (status === 'scheduled' && hasNumericScores) ||
      (isFinal && hasNumericScores && game?.winner_team_id == null))

  return (
    <div
      className={`
        rounded-lg border-2 bg-slate-900/80 p-2 min-w-[200px]
        ${isLive ? 'border-amber-500/60 animate-pulse-soft' : 'border-slate-600'}
      `}
    >
      <div className="px-2 pb-1">
        {/* Spread line (with time next to it when populated) */}
        <div className="flex h-4 items-center justify-between gap-2 font-body text-xs font-medium text-amber-400/90">
          <span className="truncate">{spreadLabel ?? '\u00A0'}</span>
          <span
            className={`shrink-0 font-semibold tracking-wide text-slate-400 ${isFinal ? 'text-slate-300' : ''}`}
          >
            {statusCornerLabel ?? '\u00A0'}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Team 1 row: team name, owner name, score */}
        <div
          className="flex items-center justify-between gap-2 rounded px-2 py-1"
          style={o1 ? { backgroundColor: `${o1.color}22`, borderLeft: `3px solid ${o1.color}` } : {}}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <span
                className={`truncate font-body text-sm text-slate-200 ${team1Won ? 'font-bold' : 'font-medium'}`}
              >
                {team1Label}
              </span>
              {team1Covered && (
                <span
                  className="shrink-0 text-amber-400"
                  title="Covered the spread"
                  aria-label="Covered the spread"
                >
                  ✓
                </span>
              )}
            </div>
            {o1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openPlayerCard(o1) }}
                className="truncate font-body text-xs font-medium text-slate-300 hover:text-slate-100 hover:underline text-left"
                title={o1.name}
              >
                {o1.avatar_emoji} {o1.name}
              </button>
            )}
          </div>
          <span
            className={`shrink-0 font-display tabular-nums text-slate-100 ${team1Won ? 'font-bold' : ''}`}
          >
            {score1 ?? '–'}
          </span>
        </div>
        {/* Team 2 row: team name, owner name, score */}
        <div
          className="flex items-center justify-between gap-2 rounded px-2 py-1"
          style={o2 ? { backgroundColor: `${o2.color}22`, borderLeft: `3px solid ${o2.color}` } : {}}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1">
              <span
                className={`truncate font-body text-sm text-slate-200 ${team2Won ? 'font-bold' : 'font-medium'}`}
              >
                {team2Label}
              </span>
              {team2Covered && (
                <span
                  className="shrink-0 text-amber-400"
                  title="Covered the spread"
                  aria-label="Covered the spread"
                >
                  ✓
                </span>
              )}
            </div>
            {o2 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); openPlayerCard(o2) }}
                className="truncate font-body text-xs font-medium text-slate-300 hover:text-slate-100 hover:underline text-left"
                title={o2.name}
              >
                {o2.avatar_emoji} {o2.name}
              </button>
            )}
          </div>
          <span
            className={`shrink-0 font-display tabular-nums text-slate-100 ${team2Won ? 'font-bold' : ''}`}
          >
            {score2 ?? '–'}
          </span>
        </div>
      </div>
      {showAdminFinalize && (
        <button
          type="button"
          onClick={() => onFinalize(game)}
          className="mt-2 w-full rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-500"
        >
          Finalize
        </button>
      )}
    </div>
  )
}
