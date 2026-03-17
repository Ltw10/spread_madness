/**
 * ESPN public scoreboard API (no key required).
 * Poll every 60s for live scores.
 */

const SCOREBOARD_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'

/**
 * Fetch current games and scores from ESPN.
 * @returns {Promise<{ games: Array<{ id: string, name: string, shortName: string, score: string, winner: boolean }>, status: object }>}
 */
export async function fetchEspnScoreboard() {
  const res = await fetch(SCOREBOARD_URL)
  if (!res.ok) throw new Error('ESPN scoreboard fetch failed')
  const data = await res.json()
  const events = data.events || []
  const games = events.map((event) => {
    const comps = event.competitions?.[0]
    const teams = (comps?.competitors || []).map((c) => ({
      id: c.id,
      name: c.team?.displayName ?? c.team?.shortDisplayName ?? 'TBD',
      shortName: c.team?.shortDisplayName ?? c.team?.abbreviation ?? '',
      score: c.score ?? '0',
      winner: c.winner === true,
    }))
    return {
      id: event.id,
      name: event.name,
      shortName: event.shortName,
      status: event.status?.type?.name,
      statusDetail: event.status?.type?.detail,
      teams,
      date: event.date,
    }
  })
  return { games, leagues: data.leagues, rawEvents: events }
}

/**
 * Extract spread from one ESPN event (competitions[0].odds[0].pointSpread).
 * Uses "close" line; favorite's line is negative (e.g. -1.5).
 * @param {object} rawEvent - event from API with competitions[0].odds
 * @returns {{ spread: number, favoredEspnId: string } | null}
 */
export function getSpreadFromEspnEvent(rawEvent) {
  const comp = rawEvent?.competitions?.[0]
  const odds = comp?.odds?.[0]
  const pointSpread = odds?.pointSpread
  if (!pointSpread?.home?.close?.line || !pointSpread?.away?.close?.line) return null
  const homeFavorite = odds?.homeTeamOdds?.favorite === true
  const awayFavorite = odds?.awayTeamOdds?.favorite === true
  const competitors = comp?.competitors || []
  const homeComp = competitors.find((c) => c.homeAway === 'home')
  const awayComp = competitors.find((c) => c.homeAway === 'away')
  if (!homeComp?.id || !awayComp?.id) return null
  const homeLineStr = String(pointSpread.home.close.line).trim()
  const awayLineStr = String(pointSpread.away.close.line).trim()
  const homeLine = parseFloat(homeLineStr.replace(',', '.'))
  const awayLine = parseFloat(awayLineStr.replace(',', '.'))
  if (Number.isNaN(homeLine) || Number.isNaN(awayLine)) return null
  if (homeFavorite) return { spread: homeLine, favoredEspnId: String(homeComp.id) }
  if (awayFavorite) return { spread: awayLine, favoredEspnId: String(awayComp.id) }
  return null
}

const SCOREBOARD_TOURNAMENT_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'
const REGION_REGEX = /\b(East|West|South|Midwest)\s+Region\b/i

/**
 * Build list of tournament date strings (YYYYMMDD) from league calendar or fallback.
 */
function getTournamentDateStrings(data) {
  const leagues = data?.leagues || []
  const calendar = leagues[0]?.calendar || []
  const season = leagues[0]?.season || {}
  const yearStr = String(season.year || new Date().getFullYear())
  const tournamentDates = []
  for (const iso of calendar) {
    const ymd = toYYYYMMDD(iso)
    if (!ymd || ymd.slice(0, 4) !== yearStr) continue
    const month = ymd.slice(4, 6)
    const day = ymd.slice(6, 8)
    if (month === '03' && parseInt(day, 10) >= 15) tournamentDates.push(ymd)
    else if (month === '04') tournamentDates.push(ymd)
  }
  if (tournamentDates.length === 0) {
    for (let d = 17; d <= 31; d++) tournamentDates.push(`${yearStr}03${String(d).padStart(2, '0')}`)
    for (let d = 1; d <= 8; d++) tournamentDates.push(`${yearStr}04${String(d).padStart(2, '0')}`)
  }
  return tournamentDates
}

/**
 * Map raw event to our games shape (for matching and scores).
 */
function eventToGame(event) {
  const comps = event.competitions?.[0]
  const teams = (comps?.competitors || []).map((c) => ({
    id: c.id,
    name: c.team?.displayName ?? c.team?.shortDisplayName ?? 'TBD',
    shortName: c.team?.shortDisplayName ?? c.team?.abbreviation ?? '',
    score: c.score ?? '0',
    winner: c.winner === true,
  }))
  return {
    id: event.id,
    name: event.name,
    shortName: event.shortName,
    status: event.status?.type?.name,
    statusDetail: event.status?.type?.detail,
    teams,
    date: event.date,
  }
}

/**
 * Fetch tournament scoreboard (groups=100) for spread sync.
 * Without a date, ESPN only returns a small window (e.g. First Four). We fetch by date
 * for each tournament day from the league calendar and merge events so we get the entire round / tournament.
 * Returns same shape as fetchEspnScoreboard so we can match games and read odds.
 */
export async function fetchTournamentScoreboard() {
  const res = await fetch(`${SCOREBOARD_TOURNAMENT_URL}?groups=100&limit=500`)
  if (!res.ok) throw new Error('ESPN tournament scoreboard fetch failed')
  const data = await res.json()
  const tournamentDates = getTournamentDateStrings(data)
  const eventIds = new Set()
  const allRawEvents = []
  for (const ev of data.events || []) {
    if (ev.id && !eventIds.has(ev.id)) {
      eventIds.add(ev.id)
      allRawEvents.push(ev)
    }
  }
  for (const dateStr of tournamentDates) {
    const dayRes = await fetch(`${SCOREBOARD_TOURNAMENT_URL}?groups=100&limit=500&dates=${dateStr}`)
    if (!dayRes.ok) continue
    const dayData = await dayRes.json()
    for (const ev of dayData.events || []) {
      if (ev.id && !eventIds.has(ev.id)) {
        eventIds.add(ev.id)
        allRawEvents.push(ev)
      }
    }
  }
  const games = allRawEvents.map(eventToGame)
  return { games, rawEvents: allRawEvents }
}

/** Parse ISO date "2026-03-17T07:00Z" -> "20260317" for ESPN dates param */
function toYYYYMMDD(isoDateStr) {
  if (!isoDateStr || typeof isoDateStr !== 'string') return null
  const match = isoDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}${match[2]}${match[3]}` : null
}

/**
 * Fetch tournament teams from ESPN scoreboard.
 * The scoreboard without a date only returns a small "current" window (e.g. next day's games), so we
 * fetch by date for each tournament day from the league calendar to get all 68 teams.
 * Used to seed sm_teams when empty. Extracts id, name, seed (curatedRank.current), region (from notes).
 * @returns {Promise<Array<{ espn_id: string, name: string, seed: number, region: string }>>}
 */
export async function fetchEspnTournamentTeams() {
  const res = await fetch(`${SCOREBOARD_TOURNAMENT_URL}?groups=100&limit=500`)
  if (!res.ok) throw new Error('ESPN tournament scoreboard fetch failed')
  const data = await res.json()
  const tournamentDates = getTournamentDateStrings(data)
  const eventIds = new Set()
  const allEvents = []
  for (const ev of data.events || []) {
    if (ev.id && !eventIds.has(ev.id)) {
      eventIds.add(ev.id)
      allEvents.push(ev)
    }
  }
  for (const dateStr of tournamentDates) {
    const dayRes = await fetch(`${SCOREBOARD_TOURNAMENT_URL}?groups=100&limit=500&dates=${dateStr}`)
    if (!dayRes.ok) continue
    const dayData = await dayRes.json()
    const dayEvents = dayData.events || []
    for (const ev of dayEvents) {
      if (ev.id && !eventIds.has(ev.id)) {
        eventIds.add(ev.id)
        allEvents.push(ev)
      }
    }
  }

  const seen = new Set()
  const teams = []
  for (const event of allEvents) {
    const comps = event.competitions?.[0]
    const notes = comps?.notes || []
    const regionNote = notes.find((n) => n.headline && REGION_REGEX.test(n.headline))
    let region = ''
    if (regionNote?.headline) {
      const m = regionNote.headline.match(REGION_REGEX)
      region = m ? m[1] : ''
    }
    const competitors = comps?.competitors || []
    for (const c of competitors) {
      const id = c.id || c.team?.id
      if (!id || seen.has(id)) continue
      seen.add(id)
      const name = c.team?.displayName ?? c.team?.shortDisplayName ?? 'TBD'
      const seed = c.curatedRank?.current != null ? parseInt(c.curatedRank.current, 10) : 0
      teams.push({ espn_id: String(id), name, seed: Number.isFinite(seed) ? seed : 0, region })
    }
  }
  return teams
}

/**
 * Map ESPN team display name / short name to our team name for matching.
 * Caller can use espn_id on teams table or fuzzy match by name.
 */
export function findMatchingTeam(teams, espnTeamNameOrId) {
  if (!teams?.length) return null
  const idMatch = teams.find((t) => String(t.espn_id) === String(espnTeamNameOrId))
  if (idMatch) return idMatch
  const nameMatch = teams.find(
    (t) =>
      t.name?.toLowerCase() === espnTeamNameOrId?.toLowerCase() ||
      t.name?.toLowerCase().includes(espnTeamNameOrId?.toLowerCase())
  )
  return nameMatch ?? null
}
