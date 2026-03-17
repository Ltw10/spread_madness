/**
 * Spread coverage logic:
 * favorite_margin = favorite_score - underdog_score
 * favorite covers → margin > spread  (favorite's owner keeps team)
 * underdog covers → margin < spread  (underdog's owner STEALS winning team)
 * push → margin === spread (no ownership change)
 */

/**
 * Determine which team covered the spread.
 * @param {number} team1Score
 * @param {number} team2Score
 * @param {number} spread - e.g. -8.5 means team1 favored by 8.5
 * @param {string} spreadTeamId - uuid of team that is favored (spread applies to them)
 * @param {string} team1Id
 * @param {string} team2Id
 * @returns {{ coverTeamId: string | null, winnerTeamId: string, isPush: boolean }}
 */
export function getCoverAndWinner(team1Score, team2Score, spread, spreadTeamId, team1Id, team2Id) {
  const winnerTeamId = team1Score > team2Score ? team1Id : team2Id
  const loserTeamId = team1Score > team2Score ? team2Id : team1Id
  const favoriteScore = spreadTeamId === team1Id ? team1Score : team2Score
  const underdogScore = spreadTeamId === team1Id ? team2Score : team1Score
  const margin = favoriteScore - underdogScore

  if (spread == null) return { coverTeamId: null, winnerTeamId, isPush: false }

  const spreadNum = Number(spread) // e.g. -8.5
  if (margin > spreadNum) {
    // Favorite covers — winner (favorite) covered
    return { coverTeamId: winnerTeamId, winnerTeamId, isPush: false }
  }
  if (margin < spreadNum) {
    // Underdog covers — underdog covered (they "win" the spread)
    const underdogTeamId = spreadTeamId === team1Id ? team2Id : team1Id
    return { coverTeamId: underdogTeamId, winnerTeamId, isPush: false }
  }
  // Push
  return { coverTeamId: null, winnerTeamId, isPush: true }
}

/**
 * Did the underdog cover? (If so, ownership transfers to underdog's owner.)
 */
export function didUnderdogCover(coverTeamId, winnerTeamId, spreadTeamId, team1Id, team2Id) {
  if (!coverTeamId || !winnerTeamId) return false
  const underdogTeamId = spreadTeamId === team1Id ? team2Id : team1Id
  return coverTeamId === underdogTeamId && winnerTeamId !== underdogTeamId
}
