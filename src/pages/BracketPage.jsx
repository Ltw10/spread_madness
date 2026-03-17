import { useMemo } from 'react'
import { Bracket } from '../components/Bracket'
import { Leaderboard } from '../components/Leaderboard'
import { TransferFeed } from '../components/TransferFeed'
import { useCreateBracketWhenEmpty } from '../hooks/useCreateBracketWhenEmpty'
import { useGames } from '../hooks/useGames'
import { useOwnership } from '../hooks/useOwnership'
import { useScores } from '../hooks/useScores'

export function BracketPage() {
  const { games, loading: gamesLoading, reload: reloadGames } = useGames()
  useCreateBracketWhenEmpty(games, reloadGames)
  const { ownership, getOwnerByTeamId } = useOwnership()
  const { scores } = useScores(false)
  const hasOwnership = ownership?.length > 0
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
        <div className="mt-6">
          <Bracket games={games} scoresByEspnId={scoresByEspnId} getOwnerByTeamId={getOwnerByTeamId} />
        </div>
        <div className="mt-6 max-w-md">
          <TransferFeed />
        </div>
      </main>
      <Leaderboard />
    </div>
  )
}
