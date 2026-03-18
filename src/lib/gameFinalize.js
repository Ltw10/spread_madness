/**
 * Shared game finalization: scores, cover, ownership transfer, bracket advancement.
 * Used by Admin (manual) and by auto score-sync when ESPN reports a game final.
 * Idempotent: if game is already final, no-op (safe for multiple clients).
 */
import { getCoverAndWinner, didUnderdogCover } from './spreadLogic'

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} game - row with id, team1_id, team2_id, spread_team_id, spread, next_game_id
 * @param {number} team1Score
 * @param {number} team2Score
 * @returns {Promise<{ coverTeamId: string|null, winnerTeamId: string, underdogCovered: boolean } | null>} null if already final (no-op)
 */
export async function finalizeGame(supabase, game, team1Score, team2Score) {
  if (!supabase || !game?.id) return null

  // Only update if not already final (idempotent; one client wins)
  const { data: updated } = await supabase
    .from('sm_games')
    .update({
      team1_score: team1Score,
      team2_score: team2Score,
      status: 'final',
      winner_team_id: null, // set below
      cover_team_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', game.id)
    .neq('status', 'final')
    .select('id')

  if (!updated?.length) return null // already final or no row

  const { coverTeamId, winnerTeamId } = getCoverAndWinner(
    team1Score,
    team2Score,
    game.spread,
    game.spread_team_id,
    game.team1_id,
    game.team2_id
  )

  await supabase
    .from('sm_games')
    .update({
      winner_team_id: winnerTeamId,
      cover_team_id: coverTeamId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', game.id)

  const team1Id = game.team1_id
  const team2Id = game.team2_id
  const underdogCovered = didUnderdogCover(coverTeamId, winnerTeamId, game.spread_team_id, team1Id, team2Id)

  if (underdogCovered) {
    const { data: winnerOwnershipRows } = await supabase
      .from('sm_ownership')
      .select('id, game_instance_id, player_id')
      .eq('team_id', winnerTeamId)
      .eq('is_active', true)
    if (winnerOwnershipRows?.length) {
      for (const currentOwner of winnerOwnershipRows) {
        const { data: underdogOwner } = await supabase
          .from('sm_ownership')
          .select('id, player_id')
          .eq('game_instance_id', currentOwner.game_instance_id)
          .eq('team_id', coverTeamId)
          .eq('is_active', true)
          .maybeSingle()
        await supabase.from('sm_ownership').update({ is_active: false }).eq('id', currentOwner.id)
        if (underdogOwner) {
          await supabase.from('sm_ownership').insert({
            game_instance_id: currentOwner.game_instance_id,
            team_id: winnerTeamId,
            player_id: underdogOwner.player_id,
            acquired_round: game.round,
            transferred_from_player_id: currentOwner.player_id,
            is_active: true,
          })
          await supabase.from('sm_transfer_events').insert({
            game_instance_id: currentOwner.game_instance_id,
            game_id: game.id,
            team_id: winnerTeamId,
            from_player_id: currentOwner.player_id,
            to_player_id: underdogOwner.player_id,
            round: game.round,
          })
        } else {
          // Covering team is unassigned: winner becomes unassigned and continues in bracket
          await supabase.from('sm_transfer_events').insert({
            game_instance_id: currentOwner.game_instance_id,
            game_id: game.id,
            team_id: winnerTeamId,
            from_player_id: currentOwner.player_id,
            to_player_id: null,
            round: game.round,
          })
        }
      }
    }
  }

  if (game.next_game_id && winnerTeamId) {
    const { data: nextRow } = await supabase.from('sm_games').select('id, team1_id, team2_id').eq('id', game.next_game_id).single()
    if (nextRow) {
      const updates = {}
      if (!nextRow.team1_id) updates.team1_id = winnerTeamId
      else if (!nextRow.team2_id) updates.team2_id = winnerTeamId
      if (Object.keys(updates).length) {
        await supabase.from('sm_games').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', game.next_game_id)
      }
    }
  }

  const eliminatedId = winnerTeamId === team1Id ? team2Id : team1Id
  await supabase.from('sm_teams').update({ is_eliminated: true }).eq('id', eliminatedId)

  return { coverTeamId, winnerTeamId, underdogCovered }
}
