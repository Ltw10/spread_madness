import { useEffect, useMemo, useState } from 'react'
import { GameMatchup } from './GameMatchup'

const REGIONS = ['East', 'West', 'South', 'Midwest']
const ROUND_LABELS = {
  1: 'Round of 64',
  2: 'Round of 32',
  3: 'Sweet 16',
  4: 'Elite 8',
  5: 'Final Four',
  6: 'National Championship',
}

/** Canonical Round of 64 matchup order (1v16, 8v9, 5v12, …). */
const ROUND1_ORDER = [
  [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
]
const ROUND1_ORDER_KEY = (s1, s2) => {
  const lo = Math.min(s1 ?? 0, s2 ?? 0)
  const hi = Math.max(s1 ?? 0, s2 ?? 0)
  const idx = ROUND1_ORDER.findIndex(([a, b]) => (a === lo && b === hi) || (a === hi && b === lo))
  return idx >= 0 ? idx : 999
}

export function Bracket({ games, scoresByEspnId, getOwnerByTeamId }) {
  const [selectedRound, setSelectedRound] = useState(null)

  const byRegionThenRound = useMemo(() => {
    const regionMap = { East: {}, West: {}, South: {}, Midwest: {}, Finals: {} }
    ;(games || []).forEach((g) => {
      const bucket = g.round >= 5 ? 'Finals' : (g.region || '')
      if (!regionMap[bucket]) regionMap[bucket] = {}
      const roundMap = regionMap[bucket]
      if (!roundMap[g.round]) roundMap[g.round] = []
      roundMap[g.round].push(g)
    })
    REGIONS.forEach((r) => {
      const roundMap = regionMap[r]
      if (!roundMap) return
      Object.keys(roundMap).forEach((roundNum) => {
        const list = roundMap[roundNum]
        const round = Number(roundNum)
        if (round === 1) {
          list.sort((a, b) => ROUND1_ORDER_KEY(a.team1?.seed, a.team2?.seed) - ROUND1_ORDER_KEY(b.team1?.seed, b.team2?.seed))
        } else {
          list.sort((a, b) => (a.team1?.seed ?? 0) - (b.team1?.seed ?? 0))
        }
      })
    })
    if (regionMap.Finals) {
      Object.keys(regionMap.Finals).forEach((round) =>
        regionMap.Finals[round].sort((a, b) => (a.region || '').localeCompare(b.region || ''))
      )
    }
    return regionMap
  }, [games])

  useEffect(() => {
    const total = (games || []).length
    if (total === 0) {
      console.log('[bracket] Bracket: 0 games, nothing to show')
      return
    }
    const summary = REGIONS.map((r) => {
      const roundMap = byRegionThenRound[r] || {}
      const perRound = Object.keys(roundMap).sort().map((round) => `${round}:${(roundMap[round] || []).length}`).join(', ')
      return `${r}=[${perRound}]`
    }).join('; ')
    const finals = byRegionThenRound.Finals || {}
    const finalsStr = Object.keys(finals).sort().map((round) => `${round}:${(finals[round] || []).length}`).join(', ')
    console.log('[bracket] Bracket: games =', total, 'byRegion', summary, 'Finals =', finalsStr)
  }, [games, byRegionThenRound])

  const renderGame = (game) => {
    const team1 = game.team1
    const team2 = game.team2
    const score1 = game.team1_score ?? (team1?.espn_id && scoresByEspnId?.[team1.espn_id]) ?? null
    const score2 = game.team2_score ?? (team2?.espn_id && scoresByEspnId?.[team2.espn_id]) ?? null
    const owner1 = getOwnerByTeamId && team1 ? getOwnerByTeamId(team1.id) : null
    const owner2 = getOwnerByTeamId && team2 ? getOwnerByTeamId(team2.id) : null
    return (
      <GameMatchup
        key={game.id}
        game={game}
        team1={team1}
        team2={team2}
        spreadTeam={game.spread_team}
        owner1={owner1}
        owner2={owner2}
        score1={score1}
        score2={score2}
        status={game.status}
      />
    )
  }

  const showRound = (round) => selectedRound == null || selectedRound === round
  const roundsList = [1, 2, 3, 4, 5, 6]

  return (
    <div className="space-y-6">
      {/* Round filter buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-body text-sm text-slate-500">Show:</span>
        <button
          type="button"
          onClick={() => setSelectedRound(null)}
          className={`rounded px-3 py-1.5 font-body text-sm ${selectedRound === null ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
        >
          All
        </button>
        {roundsList.map((round) => (
          <button
            key={round}
            type="button"
            onClick={() => setSelectedRound(round)}
            className={`rounded px-3 py-1.5 font-body text-sm ${selectedRound === round ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
          >
            {ROUND_LABELS[round]}
          </button>
        ))}
      </div>

      {/* One row per round (1–4): each row has 4 region containers */}
      {(selectedRound == null || selectedRound <= 4) &&
        [1, 2, 3, 4].filter(showRound).map((round) => (
          <div key={round} className="space-y-2">
            <h2 className="font-display text-sm font-medium uppercase tracking-wide text-slate-500">
              {ROUND_LABELS[round]}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {REGIONS.map((region) => {
                const roundMap = byRegionThenRound[region] || {}
                const gameList = roundMap[round] || []
                return (
                  <div
                    key={`${region}-${round}`}
                    className="rounded-xl border border-slate-600 bg-slate-900/50 p-4"
                  >
                    <h3 className="font-display text-base font-medium uppercase tracking-wide text-slate-300">
                      {region}
                    </h3>
                    <div className="mt-3 flex flex-col gap-2">
                      {gameList.map(renderGame)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

      {/* Final Four + National Championship: one container per round */}
      {(showRound(5) || showRound(6)) && (byRegionThenRound.Finals?.[5]?.length > 0 || byRegionThenRound.Finals?.[6]?.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[5, 6].filter(showRound).map((round) => {
            const gameList = byRegionThenRound.Finals?.[round] || []
            if (gameList.length === 0) return null
            return (
              <div
                key={round}
                className="rounded-xl border border-amber-600/40 bg-slate-900/50 p-4"
              >
                <h2 className="font-display text-base font-medium uppercase tracking-wide text-amber-400/90">
                  {ROUND_LABELS[round]}
                </h2>
                <div className="mt-3 flex flex-col gap-2">
                  {gameList.map(renderGame)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
