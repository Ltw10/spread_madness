import { usePlayerModal } from '../context/PlayerModalContext'
import { useOwnership } from '../hooks/useOwnership'
import { usePlayers } from '../hooks/usePlayers'

export function Leaderboard({ showHeading = true, embedded = false }) {
  const { openPlayerCard } = usePlayerModal()
  const { getAliveTeamIdsForPlayer } = useOwnership()
  const { players } = usePlayers()

  const aliveByPlayer = players.map((p) => ({
    player: p,
    count: getAliveTeamIdsForPlayer(p.id).length,
  }))
  const sorted = [...aliveByPlayer].sort((a, b) => b.count - a.count)

  return (
    <aside className={`rounded-xl border border-slate-600 bg-slate-900/90 p-3 ${embedded ? 'w-full border-0 bg-transparent p-0' : 'w-56 shrink-0 max-w-full'}`}>
      {showHeading && (
        <>
          <h2 className="font-display text-lg tracking-wide text-slate-100">Leaderboard</h2>
          <p className="mb-2 font-body text-xs text-slate-400">
            Teams still alive <span className="text-slate-500">(incl. stolen)</span>
          </p>
        </>
      )}
      <ul className="space-y-2">
        {sorted.map(({ player, count }) => (
          <li key={player.id} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: player.color }}
              aria-hidden
            />
            <button
              type="button"
              onClick={() => openPlayerCard(player)}
              className="font-body text-sm text-slate-200 hover:text-white hover:underline text-left"
            >
              {player.avatar_emoji} {player.name}
            </button>
            <span className="ml-auto font-display tabular-nums text-slate-300">{count}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
