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
  const { ownership, getDraftOwnerByTeamId, getOwnerAtBracketRoundStart, getOwnerByTeamId } = useOwnership()
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

  /**
   * Same ownership as the bracket card for that round: R64 = draft owner; later rounds = owner at start of that round.
   * So Round of 32 only shows games where the player held team1 or team2 entering that round (not teams stolen earlier).
   */
  const gamesToShow = useMemo(() => {
    if (!playerFilterId || playerFilterId === 'all') return games
    const pid = String(playerFilterId)
    return (games || []).filter((g) => {
      const r = Number(g.round)
      const t1 = g.team1_id ?? g.team1?.id ?? null
      const t2 = g.team2_id ?? g.team2?.id ?? null
      const ownerForTeamThisRound = (teamId) => {
        if (teamId == null) return null
        if (r === 1) return getDraftOwnerByTeamId(teamId) ?? getOwnerByTeamId(teamId)
        if (r >= 2) return getOwnerAtBracketRoundStart(teamId, r) ?? getOwnerByTeamId(teamId)
        return getOwnerByTeamId(teamId)
      }
      const o1 = ownerForTeamThisRound(t1)
      const o2 = ownerForTeamThisRound(t2)
      return (o1 && String(o1.id) === pid) || (o2 && String(o2.id) === pid)
    })
  }, [
    games,
    playerFilterId,
    getDraftOwnerByTeamId,
    getOwnerAtBracketRoundStart,
    getOwnerByTeamId,
  ])

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

        <div className="mt-4 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
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
          <p className="font-body text-xs text-slate-500">
            Each round only lists games where they owned either team <strong className="font-medium text-slate-400">for that round</strong>{' '}
            (same as the names on the cards).
          </p>
        </div>

        <div className="mt-6">
          <Bracket
            games={gamesToShow}
            gamesForOrdering={games}
            scoresByEspnId={scoresByEspnId}
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
