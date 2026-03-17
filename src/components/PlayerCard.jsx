import { useOwnership } from '../hooks/useOwnership'
import { usePlayerModal } from '../context/PlayerModalContext'

function TeamLine({ team, transferredFrom, eliminated }) {
  const label = team ? `${team.seed} ${team.name}` : '–'
  return (
    <div className="flex flex-col gap-0.5">
      <span className={eliminated ? 'font-body text-sm text-slate-400 line-through' : 'font-body text-sm text-slate-200'}>
        {label}
      </span>
      {transferredFrom && (
        <span className="font-body text-xs text-slate-500">
          from {transferredFrom.avatar_emoji} {transferredFrom.name}
        </span>
      )}
    </div>
  )
}

export function PlayerCard() {
  const { selectedPlayer, closePlayerCard } = usePlayerModal()
  const { ownership } = useOwnership()

  if (!selectedPlayer) return null

  const playerId = String(selectedPlayer.id)
  const myRows = (ownership || []).filter((o) => String(o.player_id) === playerId)
  const remaining = myRows
    .filter((o) => !o.team?.is_eliminated)
    .sort((a, b) => (a.team?.seed ?? 99) - (b.team?.seed ?? 99))
  const eliminated = myRows.filter((o) => o.team?.is_eliminated)

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        aria-hidden
        onClick={closePlayerCard}
      />
      <div
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-card-title"
      >
        <div className="border-b border-slate-600 p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 id="player-card-title" className="font-display text-lg tracking-wide text-slate-100">
              <span className="mr-2 inline-block h-4 w-4 rounded-full" style={{ backgroundColor: selectedPlayer.color }} />
              {selectedPlayer.avatar_emoji} {selectedPlayer.name}
            </h2>
            <button
              type="button"
              onClick={closePlayerCard}
              className="rounded p-1 font-body text-slate-400 hover:bg-slate-700 hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-4">
          <section>
            <h3 className="font-display text-sm uppercase tracking-wide text-emerald-400/90 mb-2">
              Teams remaining ({remaining.length})
            </h3>
            {remaining.length === 0 ? (
              <p className="font-body text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-2">
                {remaining.map((o) => (
                  <li key={o.team_id} className="rounded border border-slate-600 bg-slate-800/60 px-3 py-2">
                    <TeamLine team={o.team} transferredFrom={o.transferred_from} eliminated={false} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="font-display text-sm uppercase tracking-wide text-slate-500 mb-2">
              Teams eliminated ({eliminated.length})
            </h3>
            {eliminated.length === 0 ? (
              <p className="font-body text-sm text-slate-500">None</p>
            ) : (
              <ul className="space-y-2">
                {eliminated.map((o) => (
                  <li key={o.team_id} className="rounded border border-slate-700 bg-slate-800/40 px-3 py-2">
                    <TeamLine team={o.team} transferredFrom={o.transferred_from} eliminated={true} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
