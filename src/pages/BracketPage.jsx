import { useMemo, useState } from 'react'
import { Bracket } from '../components/Bracket'
import { Leaderboard } from '../components/Leaderboard'
import { TransferFeed } from '../components/TransferFeed'
import { useCreateBracketWhenEmpty } from '../hooks/useCreateBracketWhenEmpty'
import { useGames } from '../hooks/useGames'
import { useOwnership } from '../hooks/useOwnership'
import { useScores } from '../hooks/useScores'
import { usePlayers } from '../hooks/usePlayers'

export function BracketPage() {
  const { games, loading: gamesLoading, reload: reloadGames } = useGames()
  useCreateBracketWhenEmpty(games, reloadGames)
  const { ownership, getOwnerByTeamId } = useOwnership()
  const { players, loading: playersLoading } = usePlayers()
  const { scores } = useScores(false)
  const hasOwnership = ownership?.length > 0
  const [mobileLeaderboardOpen, setMobileLeaderboardOpen] = useState(false)
  const [playerFilterId, setPlayerFilterId] = useState('all')
  console.log('[bracket] BracketPage render: games.length =', games?.length ?? 0, 'gamesLoading =', gamesLoading)

  const scoresByEspnId = useMemo(() => {
    const map = {}
    for (const g of scores.games || []) {
      for (const t of g.teams || []) {
        if (t.id) map[t.id] = t.score
      }
    }
    return map
  }, [scores])

  const ownedTeamIds = useMemo(() => {
    if (!playerFilterId || playerFilterId === 'all') return null
    const id = String(playerFilterId)
    const set = new Set()
    for (const o of ownership || []) {
      if (String(o.player_id) === id && o.team_id) set.add(String(o.team_id))
    }
    return set
  }, [ownership, playerFilterId])

  const gamesToShow = useMemo(() => {
    if (!ownedTeamIds) return games
    return (games || []).filter((g) => {
      const t1 = g.team1_id ?? g.team1?.id ?? null
      const t2 = g.team2_id ?? g.team2?.id ?? null
      return (t1 && ownedTeamIds.has(String(t1))) || (t2 && ownedTeamIds.has(String(t2)))
    })
  }, [games, ownedTeamIds])

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 md:flex-row md:gap-6 md:p-6">
      <main className="min-w-0 flex-1">
        <h1 className="font-display text-3xl tracking-wide text-white">Spread Madness</h1>
        <p className="mt-1 font-body text-slate-400">Bracket by spread — cover to steal.</p>
        {games?.length > 0 && !hasOwnership && (
          <p className="mt-2 font-body text-sm text-slate-500">
            Owner names will appear after the draft is submitted.
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="font-body text-sm text-slate-300" htmlFor="player-filter">
            Filter player:
          </label>
          <select
            id="player-filter"
            value={playerFilterId}
            onChange={(e) => setPlayerFilterId(e.target.value)}
            disabled={playersLoading || !players?.length}
            className="rounded border border-slate-600 bg-slate-900/40 px-3 py-2 font-body text-slate-200 disabled:opacity-60"
          >
            <option value="all">All players</option>
            {(players || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.avatar_emoji} {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6">
          <Bracket
            games={gamesToShow}
            scoresByEspnId={scoresByEspnId}
            getOwnerByTeamId={getOwnerByTeamId}
            headerExtra={
              <button
                type="button"
                onClick={() => setMobileLeaderboardOpen(true)}
                className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-800 py-2.5 font-body text-sm font-medium text-slate-200 touch-manipulation md:hidden"
              >
                Leaderboard
              </button>
            }
          />
        </div>
        <div className="mt-6 max-w-md">
          <TransferFeed />
        </div>
      </main>
      <aside className="hidden shrink-0 md:block">
        <Leaderboard />
      </aside>

      {mobileLeaderboardOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            aria-hidden
            onClick={() => setMobileLeaderboardOpen(false)}
          />
          <div
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-auto rounded-t-xl border-t border-slate-600 bg-slate-900 md:hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-leaderboard-title"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-600 bg-slate-900 px-4 py-3">
              <h2 id="mobile-leaderboard-title" className="font-display text-lg tracking-wide text-slate-100">
                Leaderboard
              </h2>
              <button
                type="button"
                onClick={() => setMobileLeaderboardOpen(false)}
                className="rounded p-2 font-body text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <p className="mb-2 font-body text-xs text-slate-400">Teams still alive</p>
              <Leaderboard showHeading={false} embedded />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
