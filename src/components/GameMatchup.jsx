import { usePlayerModal } from '../context/PlayerModalContext'
import { useOwnership } from '../hooks/useOwnership'

export function GameMatchup({ game, team1, team2, spreadTeam, owner1, owner2, score1, score2, status, onFinalize, isAdmin }) {
  const { openPlayerCard } = usePlayerModal()
  const { getOwnerByTeamId } = useOwnership()
  const o1 = owner1 ?? (team1 ? getOwnerByTeamId(team1.id) : null)
  const o2 = owner2 ?? (team2 ? getOwnerByTeamId(team2.id) : null)

  const team1Label = team1 ? (team1.seed != null ? `${team1.seed} ${team1.name}` : team1.name) : 'TBD'
  const team2Label = team2 ? (team2.seed != null ? `${team2.seed} ${team2.name}` : team2.name) : 'TBD'

  const spreadNum = game?.spread != null ? Number(game.spread) : null
  const isLive = status === 'in_progress'
  const isFinal = status === 'final'
  const spreadLabel =
    spreadNum != null && spreadTeam?.name
      ? `${spreadTeam.name} ${spreadNum > 0 ? '+' : ''}${spreadNum}`
      : spreadNum != null
        ? `${spreadNum > 0 ? '+' : ''}${spreadNum}`
        : null
  // Placeholder until we persist / pass through a real clock string from ESPN.
  const timeLabel = isLive ? 'LIVE' : null

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
          <span className="truncate">{!isFinal && spreadLabel ? spreadLabel : '\u00A0'}</span>
          <span className="shrink-0 text-slate-400">{timeLabel ?? '\u00A0'}</span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {/* Team 1 row: team name, owner name, score */}
        <div
          className="flex items-center justify-between gap-2 rounded px-2 py-1"
          style={o1 ? { backgroundColor: `${o1.color}22`, borderLeft: `3px solid ${o1.color}` } : {}}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-body text-sm font-medium text-slate-200">{team1Label}</div>
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
          <span className="shrink-0 font-display tabular-nums text-slate-100">{score1 ?? '–'}</span>
        </div>
        {/* Team 2 row: team name, owner name, score */}
        <div
          className="flex items-center justify-between gap-2 rounded px-2 py-1"
          style={o2 ? { backgroundColor: `${o2.color}22`, borderLeft: `3px solid ${o2.color}` } : {}}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate font-body text-sm font-medium text-slate-200">{team2Label}</div>
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
          <span className="shrink-0 font-display tabular-nums text-slate-100">{score2 ?? '–'}</span>
        </div>
      </div>
      {isAdmin && isLive && onFinalize && (
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
