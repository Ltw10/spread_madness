import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchEspnScoreboard, fetchTournamentScoreboard, getSpreadFromEspnEvent } from '../lib/espnApi'
import {
  finalizeGame,
  refinalizeFinalsWithSpreadButMissingCover,
  repairGamesWithDuplicateOpponents,
} from '../lib/gameFinalize'

const POLL_MS = 60 * 1000 // 60s when app is open

/**
 * Match our game (with team1, team2) to an ESPN event.
 * ESPN event has teams[].id and teams[].name. We match by espn_id or name.
 * Returns which ESPN competitor is our team1 so we can assign scores correctly.
 */
function matchGameToEspnEvent(ourGame, espnEvents) {
  const id1 = ourGame.team1_id ?? ourGame.team1?.id
  const id2 = ourGame.team2_id ?? ourGame.team2?.id
  if (id1 && id2 && String(id1) === String(id2)) return null

  const t1 = ourGame.team1
  const t2 = ourGame.team2
  if (!t1?.name && !t1?.espn_id) return null
  if (!t2?.name && !t2?.espn_id) return null

  for (const ev of espnEvents) {
    const teams = ev.teams || []
    if (teams.length < 2) continue
    const [a, b] = teams
    const t1MatchesA = String(t1.espn_id) === String(a.id) || (t1?.name && a.name && (t1.name.toLowerCase() === a.name.toLowerCase() || t1.name.toLowerCase().includes(a.name.toLowerCase())))
    const t1MatchesB = String(t1.espn_id) === String(b.id) || (t1?.name && b.name && (t1.name.toLowerCase() === b.name.toLowerCase() || t1.name.toLowerCase().includes(b.name.toLowerCase())))
    const t2MatchesA = String(t2.espn_id) === String(a.id) || (t2?.name && a.name && (t2.name.toLowerCase() === a.name.toLowerCase() || t2.name.toLowerCase().includes(a.name.toLowerCase())))
    const t2MatchesB = String(t2.espn_id) === String(b.id) || (t2?.name && b.name && (t2.name.toLowerCase() === b.name.toLowerCase() || t2.name.toLowerCase().includes(b.name.toLowerCase())))
    const match = (t1MatchesA && t2MatchesB) || (t1MatchesB && t2MatchesA)
    if (!match) continue
    const team1IsFirst = t1MatchesA
    return {
      event: ev,
      team1Score: team1IsFirst ? parseInt(a.score, 10) : parseInt(b.score, 10),
      team2Score: team1IsFirst ? parseInt(b.score, 10) : parseInt(a.score, 10),
    }
  }
  return null
}

/** ESPN status meaning game is finished */
function isEspnEventFinal(ev) {
  const s = (ev?.status || '').toLowerCase()
  return s === 'final' || s === 'completed' || s === 'status_final' || s === 'status_completed'
}

/** True if we should try ESPN again for spread (missing line or favored team). */
function gameNeedsSpread(game) {
  return game.spread == null || game.spread_team_id == null
}

/**
 * Write spread from a raw ESPN event if the game still needs one.
 * @returns {Promise<boolean>} true if a row was updated
 */
async function applySpreadFromRawEvent(client, game, rawEvent, reloadGames) {
  if (!gameNeedsSpread(game)) return false
  const spreadInfo = rawEvent ? getSpreadFromEspnEvent(rawEvent) : null
  if (!spreadInfo) return false
  const t1 = game.team1 || {}
  const t2 = game.team2 || {}
  const favoredOurId =
    String(t1.espn_id) === String(spreadInfo.favoredEspnId)
      ? game.team1_id
      : String(t2.espn_id) === String(spreadInfo.favoredEspnId)
        ? game.team2_id
        : null
  if (favoredOurId == null) return false
  if (game.spread === spreadInfo.spread && game.spread_team_id === favoredOurId) return false
  await client
    .from('sm_games')
    .update({
      spread: spreadInfo.spread,
      spread_team_id: favoredOurId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', game.id)
  if (reloadGames) reloadGames()
  return true
}

/**
 * One-shot sync: fetch ESPN scoreboard, update sm_games with scores (and spreads when missing),
 * and auto-finalize games ESPN marks as completed. Used by auto-polling and by admin "Refresh scores now".
 * @param {import('@supabase/supabase-js').SupabaseClient} client
 * @param {Array} currentGames - list of games with team1, team2, etc.
 * @param {() => void} [reloadGames] - called after updates
 * @returns {{ error?: string, updated?: number }}
 */
export async function runScoreSyncOnce(client, currentGames, reloadGames) {
  if (!client) return { updated: 0 }
  try {
    const { repaired } = await repairGamesWithDuplicateOpponents(client)
    if (repaired > 0) {
      if (reloadGames) await reloadGames()
      // Fresh games on next poll; avoid syncing against stale duplicate rows this pass.
      return { updated: repaired, repairedDuplicateSlots: true }
    }

    if (!currentGames?.length) return { updated: 0 }

    const { games: defaultGames = [], rawEvents: defaultRaw = [] } = await fetchEspnScoreboard()
    const hasNonFinal = currentGames.some((g) => g.status !== 'final')
    const anyNeedsSpread = currentGames.some(gameNeedsSpread)

    /**
     * Default scoreboard is a small window; R32+ often only appear on tournament feed.
     * Merge when we need scores (non-final) or any game is missing spread (incl. all-final brackets).
     */
    let espnGames = [...defaultGames]
    let rawEvents = [...defaultRaw]
    if (hasNonFinal || anyNeedsSpread) {
      try {
        const { games: tournamentGames = [], rawEvents: tournamentRaw = [] } =
          await fetchTournamentScoreboard()
        const seenIds = new Set(espnGames.map((g) => String(g.id)))
        for (const g of tournamentGames) {
          if (g?.id == null) continue
          const id = String(g.id)
          if (seenIds.has(id)) continue
          seenIds.add(id)
          espnGames.push(g)
        }
        const rawById = new Map(rawEvents.map((r) => [String(r.id), r]))
        for (const r of tournamentRaw) {
          if (r?.id == null) continue
          const id = String(r.id)
          if (!rawById.has(id)) rawById.set(id, r)
        }
        rawEvents = [...rawById.values()]
      } catch (mergeErr) {
        console.warn('Tournament merge for score sync failed:', mergeErr)
      }
    }

    let updated = 0

    if (espnGames.length) {
      for (const game of currentGames) {
        // Repair stuck finals: marked final but winner/advance/elim never applied (see gameFinalize.js)
        if (game.status === 'final') {
          const t1 = game.team1_score
          const t2 = game.team2_score
          if (game.winner_team_id == null && Number.isFinite(Number(t1)) && Number.isFinite(Number(t2))) {
            await finalizeGame(client, game, Number(t1), Number(t2))
            updated++
            if (reloadGames) reloadGames()
          }
          continue
        }
        const matched = matchGameToEspnEvent(game, espnGames)
        if (!matched) continue

        const { event: ev, team1Score, team2Score } = matched
        const scoresValid = Number.isFinite(team1Score) && Number.isFinite(team2Score)
        if (!scoresValid) continue

        const espnFinal = isEspnEventFinal(ev)

        if (espnFinal) {
          await finalizeGame(client, game, team1Score, team2Score)
          updated++
          if (reloadGames) reloadGames()
        } else {
          if (game.team1_score !== team1Score || game.team2_score !== team2Score) {
            await client
              .from('sm_games')
              .update({
                team1_score: team1Score,
                team2_score: team2Score,
                status: 'in_progress',
                updated_at: new Date().toISOString(),
              })
              .eq('id', game.id)
            updated++
            if (reloadGames) reloadGames()
          }
        }

        if (gameNeedsSpread(game)) {
          const rawEvent = rawEvents.find((r) => String(r.id) === String(ev.id))
          if (await applySpreadFromRawEvent(client, game, rawEvent, reloadGames)) updated++
        }
      }

      // Finals skip the loop above; still backfill spread when missing (e.g. finalized before line synced).
      for (const game of currentGames) {
        if (game.status !== 'final' || !gameNeedsSpread(game)) continue
        const matched = matchGameToEspnEvent(game, espnGames)
        if (!matched) continue
        const rawEvent = rawEvents.find((r) => String(r.id) === String(matched.event.id))
        if (await applySpreadFromRawEvent(client, game, rawEvent, reloadGames)) updated++
      }
    }

    // DB read: finals that gained spread later never got cover/winner re-applied; also works if ESPN fetch failed.
    const { refinalized } = await refinalizeFinalsWithSpreadButMissingCover(client)
    if (refinalized > 0) {
      updated += refinalized
      if (reloadGames) await reloadGames()
    }

    return { updated }
  } catch (err) {
    console.warn('Score sync failed:', err)
    return { error: err?.message || String(err) }
  }
}

/**
 * Runs on app load and every POLL_MS: fetch ESPN, update our games' scores,
 * and auto-finalize any game ESPN marks as completed.
 */
export function useAutoScoreSync(games, reloadGames) {
  const intervalRef = useRef(null)
  const gamesRef = useRef(games)
  gamesRef.current = games

  const runSync = async () => {
    runScoreSyncOnce(supabase, gamesRef.current, reloadGames)
  }

  useEffect(() => {
    runSync()
    intervalRef.current = setInterval(runSync, POLL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [games?.length]) // Run when games load; interval handles ongoing updates
}
