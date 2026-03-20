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

/** Typical NCAA tournament round start dates (month 0-indexed). Used to pick default round on load. */
const ROUND_START_DATES = [
  { round: 1, month: 2, day: 19 }, // Round of 64 — Thursday
  { round: 2, month: 2, day: 21 }, // Round of 32
  { round: 3, month: 2, day: 27 }, // Sweet 16
  { round: 4, month: 2, day: 29 }, // Elite 8
  { round: 5, month: 3, day: 5 },  // Final Four (April)
  { round: 6, month: 3, day: 6 },  // National Championship
]

/** Return the round number (1–6) that is "current" based on today's date. Before round 1 starts, returns 1. */
function getCurrentRoundNumber() {
  const now = new Date()
  const year = now.getFullYear()
  const today = new Date(year, now.getMonth(), now.getDate())
  today.setHours(0, 0, 0, 0)
  let current = 1
  for (const { round, month, day } of ROUND_START_DATES) {
    const roundStart = new Date(year, month, day)
    roundStart.setHours(0, 0, 0, 0)
    if (roundStart <= today) current = round
    else break
  }
  return current
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

/**
 * Bracket slot order for any round: min tree key among feeder games (`next_game_id` chain).
 * R64 leaves use region×10 + ROUND1_ORDER slot; later rounds take min(feeders) so order matches winners “down the line”.
 */
function regionOrderIndex(region) {
  const i = REGIONS.indexOf(region || '')
  return i >= 0 ? i : 999
}

/**
 * R64 leaf key: region slot + seed-pair order so later rounds compare across regions correctly
 * (e.g. Final Four East/West game sorts before South/Midwest).
 */
function roundOneTreeKey(game) {
  return regionOrderIndex(game.region) * 10 + ROUND1_ORDER_KEY(game.team1?.seed, game.team2?.seed)
}

function makeBracketTreeOrderKey(orderSource) {
  const keyMemo = new Map()

  function bracketTreeOrderKey(game) {
    if (game?.id == null) return 999
    const id = String(game.id)
    if (keyMemo.has(id)) return keyMemo.get(id)
    const r = Number(game.round)
    if (r === 1) {
      const k = roundOneTreeKey(game)
      keyMemo.set(id, k)
      return k
    }
    const feeders = (orderSource || []).filter(
      (g) => g.next_game_id != null && String(g.next_game_id) === id
    )
    if (feeders.length === 0) {
      const k = game.team1?.seed ?? game.team2?.seed ?? 999
      keyMemo.set(id, k)
      return k
    }
    let minK = 999
    for (const f of feeders) {
      const k = bracketTreeOrderKey(f)
      if (k < minK) minK = k
    }
    keyMemo.set(id, minK)
    return minK
  }

  return bracketTreeOrderKey
}

function sortByBracketTree(list, bracketTreeOrderKey) {
  list.sort((a, b) => {
    const ka = bracketTreeOrderKey(a)
    const kb = bracketTreeOrderKey(b)
    if (ka !== kb) return ka - kb
    return String(a.id).localeCompare(String(b.id))
  })
}

/**
 * @param {object[]} games - Matchups to render (may be filtered).
 * @param {object[]} [gamesForOrdering] - Full bracket for tree ordering (`next_game_id`); defaults to `games`.
 */
export function Bracket({ games, scoresByEspnId, headerExtra, gamesForOrdering }) {
  const [selectedRound, setSelectedRound] = useState(() => getCurrentRoundNumber())
  const orderSource = gamesForOrdering ?? games

  const byRegionThenRound = useMemo(() => {
    const bracketTreeOrderKey = makeBracketTreeOrderKey(orderSource)

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
        sortByBracketTree(list, bracketTreeOrderKey)
      })
    })
    if (regionMap.Finals) {
      Object.keys(regionMap.Finals).forEach((roundNum) => {
        const list = regionMap.Finals[roundNum]
        sortByBracketTree(list, bracketTreeOrderKey)
      })
    }
    return regionMap
  }, [games, orderSource])

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
    return (
      <GameMatchup
        key={game.id}
        game={game}
        team1={team1}
        team2={team2}
        spreadTeam={game.spread_team}
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
      <p className="font-body text-xs text-slate-500">
        <span className="font-bold text-slate-400">Final</span> games: winner’s name and score are bold;{' '}
        <span className="text-amber-400">✓</span> = covered the spread (push = no check).
      </p>
      {headerExtra}

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
