/**
 * Spread coverage logic (American / ESPN convention):
 * - We store `spread` as the **favorite’s** closing line from ESPN: **negative** (e.g. Duke -27.5 → -27.5).
 * - `favoriteMargin` = favorite_score − underdog_score (positive when the favorite wins on the board).
 * - Favorite **covers ATS** iff favoriteMargin **>** |line| (e.g. must win by more than 27.5).
 * - **Never** compare raw margin to a negative line (6 > -27.5 would wrongly say the favorite covered).
 * - Underdog covers when favoriteMargin < |line| (includes “favorite wins but not by enough”).
 * - Push when favoriteMargin === |line|.
 */

/**
 * Determine which team covered the spread.
 * @param {number} team1Score
 * @param {number} team2Score
 * @param {number} spread - favorite’s American line (negative), e.g. -27.5 for a 27.5-pt favorite
 * @param {string} spreadTeamId - uuid of team that is favored (spread applies to them)
 * @param {string} team1Id
 * @param {string} team2Id
 * @returns {{ coverTeamId: string | null, winnerTeamId: string, isPush: boolean }}
 */
export function getCoverAndWinner(team1Score, team2Score, spread, spreadTeamId, team1Id, team2Id) {
  const winnerTeamId = team1Score > team2Score ? team1Id : team2Id
  const favoriteScore = spreadTeamId === team1Id ? team1Score : team2Score
  const underdogScore = spreadTeamId === team1Id ? team2Score : team1Score
  const favoriteMargin = favoriteScore - underdogScore

  // Without favored team, spread line is ambiguous — still pick winner; no cover / no steal.
  if (spread == null || spreadTeamId == null) return { coverTeamId: null, winnerTeamId, isPush: false }

  const rawLine = Number(spread)
  if (Number.isNaN(rawLine)) return { coverTeamId: null, winnerTeamId, isPush: false }

  // Points the favorite must win by to cover (ESPN negative line → positive threshold).
  const coverThreshold = Math.abs(rawLine)
  const underdogTeamId = spreadTeamId === team1Id ? team2Id : team1Id

  if (favoriteMargin > coverThreshold) {
    // Favorite covered ATS (game winner is usually the favorite here, but cover is defined by margin vs line).
    return { coverTeamId: spreadTeamId, winnerTeamId, isPush: false }
  }
  if (favoriteMargin < coverThreshold) {
    // Underdog covered ATS (favorite didn’t win by enough, or underdog won outright).
    return { coverTeamId: underdogTeamId, winnerTeamId, isPush: false }
  }
  // Push on the number
  return { coverTeamId: null, winnerTeamId, isPush: true }
}

/**
 * Did the underdog cover? (If so, ownership transfers to underdog's owner.)
 */
export function didUnderdogCover(coverTeamId, winnerTeamId, spreadTeamId, team1Id, team2Id) {
  if (!coverTeamId || !winnerTeamId || spreadTeamId == null) return false
  const underdogTeamId = spreadTeamId === team1Id ? team2Id : team1Id
  return coverTeamId === underdogTeamId && winnerTeamId !== underdogTeamId
}
