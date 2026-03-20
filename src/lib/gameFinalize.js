/**
 * Shared game finalization: scores, cover, ownership transfer, bracket advancement.
 * Used by Admin (manual), auto score-sync, and admin bulk refinalize / full draft replay.
 */
import { getCoverAndWinner, didUnderdogCover } from './spreadLogic'

/** Same shape as useGames() for finalize / replay. */
const SM_GAMES_WITH_TEAMS_SELECT = `
  *,
  team1:sm_teams!sm_games_team1_id_fkey(id, name, seed, region, espn_id, is_eliminated),
  team2:sm_teams!sm_games_team2_id_fkey(id, name, seed, region, espn_id, is_eliminated),
  spread_team:sm_teams!sm_games_spread_team_id_fkey(id, name),
  winner_team:sm_teams!sm_games_winner_team_id_fkey(id, name),
  cover_team:sm_teams!sm_games_cover_team_id_fkey(id, name)
`

export async function fetchSmGamesWithTeams(supabase) {
  const { data, error } = await supabase
    .from('sm_games')
    .select(SM_GAMES_WITH_TEAMS_SELECT)
    .order('round')
    .order('region')
  if (error) throw error
  return data || []
}

async function fetchSmGameWithTeamsById(supabase, gameId) {
  const { data, error } = await supabase.from('sm_games').select(SM_GAMES_WITH_TEAMS_SELECT).eq('id', gameId).maybeSingle()
  if (error) throw error
  return data
}

/**
 * Winner/cover, optional underdog steal, next-game slot, elimination.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} game
 * @param {number} team1Score
 * @param {number} team2Score
 * @param {{ refinalize?: boolean }} options - refinalize: game already final; refresh DB fields; forward steal is idempotent
 * @returns {Promise<{ coverTeamId: string|null, winnerTeamId: string, underdogCovered: boolean } | null>}
 */
export async function applyFinalizeEffects(supabase, game, team1Score, team2Score, options = {}) {
  const refinalize = options.refinalize === true
  if (!supabase || !game?.id) return null

  const s1 = Number(team1Score)
  const s2 = Number(team2Score)
  if (!Number.isFinite(s1) || !Number.isFinite(s2)) return null

  const { coverTeamId, winnerTeamId } = getCoverAndWinner(
    s1,
    s2,
    game.spread,
    game.spread_team_id,
    game.team1_id,
    game.team2_id
  )

  const patch = {
    winner_team_id: winnerTeamId,
    cover_team_id: coverTeamId,
    updated_at: new Date().toISOString(),
  }
  if (refinalize) {
    patch.team1_score = s1
    patch.team2_score = s2
  }

  const { error: winnerErr } = await supabase.from('sm_games').update(patch).eq('id', game.id)
  if (winnerErr) console.error('[finalizeGame] set winner/cover failed', winnerErr)

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

        if (underdogOwner && refinalize && String(currentOwner.player_id) === String(underdogOwner.player_id)) {
          continue
        }

        const { error: deactErr } = await supabase.from('sm_ownership').update({ is_active: false }).eq('id', currentOwner.id)
        if (deactErr) console.error('[finalizeGame] deactivate prior winner ownership failed', deactErr)
        if (underdogOwner) {
          const { error: insErr } = await supabase.from('sm_ownership').insert({
            game_instance_id: currentOwner.game_instance_id,
            team_id: winnerTeamId,
            player_id: underdogOwner.player_id,
            acquired_round: game.round,
            transferred_from_player_id: currentOwner.player_id,
            is_active: true,
          })
          if (insErr) console.error('[finalizeGame] ownership transfer insert failed', insErr)
          const { error: teErr } = await supabase.from('sm_transfer_events').insert({
            game_instance_id: currentOwner.game_instance_id,
            game_id: game.id,
            team_id: winnerTeamId,
            from_player_id: currentOwner.player_id,
            to_player_id: underdogOwner.player_id,
            round: game.round,
          })
          if (teErr) console.error('[finalizeGame] transfer_events insert failed', teErr)
        } else {
          const { error: teErr } = await supabase.from('sm_transfer_events').insert({
            game_instance_id: currentOwner.game_instance_id,
            game_id: game.id,
            team_id: winnerTeamId,
            from_player_id: currentOwner.player_id,
            to_player_id: null,
            round: game.round,
          })
          if (teErr) console.error('[finalizeGame] transfer_events (unassigned cover) failed', teErr)
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
        const { error: nextErr } = await supabase
          .from('sm_games')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('id', game.next_game_id)
        if (nextErr) console.error('[finalizeGame] advance winner to next game failed', nextErr)
      }
    }
  }

  const eliminatedId = winnerTeamId === team1Id ? team2Id : team1Id
  if (eliminatedId) {
    const { error: elimErr } = await supabase.from('sm_teams').update({ is_eliminated: true }).eq('id', eliminatedId)
    if (elimErr) console.error('[finalizeGame] mark eliminated failed', elimErr)
  }

  return { coverTeamId, winnerTeamId, underdogCovered }
}

/**
 * Normal finalize: mark final if needed, then apply effects.
 * Idempotent: if game is already final with winner set, no-op (except repair path).
 */
export async function finalizeGame(supabase, game, team1Score, team2Score) {
  if (!supabase || !game?.id) return null

  const s1 = Number(team1Score)
  const s2 = Number(team2Score)
  if (!Number.isFinite(s1) || !Number.isFinite(s2)) return null

  const needsRepair = game.status === 'final' && game.winner_team_id == null

  let transitioned = false
  if (!needsRepair) {
    const { data: updated, error: markErr } = await supabase
      .from('sm_games')
      .update({
        team1_score: s1,
        team2_score: s2,
        status: 'final',
        winner_team_id: null,
        cover_team_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', game.id)
      .neq('status', 'final')
      .select('id')
    if (markErr) console.error('[finalizeGame] mark final failed', markErr)
    transitioned = Boolean(updated?.length)
  }

  if (!transitioned && !needsRepair) return null

  return applyFinalizeEffects(supabase, game, s1, s2, { refinalize: false })
}

/**
 * Re-apply finalize effects for a game that is already final (e.g. after spread-logic fix).
 * Uses scores on the game row; updates winner/cover/steal/next/elim idempotently where possible.
 */
export async function refinalizeFinalGame(supabase, game) {
  if (!supabase || !game?.id || game.status !== 'final') return null
  const s1 = Number(game.team1_score)
  const s2 = Number(game.team2_score)
  if (!Number.isFinite(s1) || !Number.isFinite(s2)) return null
  return applyFinalizeEffects(supabase, game, s1, s2, { refinalize: true })
}

/**
 * Sort finals by bracket order so earlier rounds run before later ones.
 */
function sortFinalGamesForReplay(games) {
  return [...(games || [])]
    .filter((g) => {
      if (g.status !== 'final') return false
      const a = Number(g.team1_score)
      const b = Number(g.team2_score)
      return Number.isFinite(a) && Number.isFinite(b)
    })
    .sort((a, b) => {
      const ra = Number(a.round) || 0
      const rb = Number(b.round) || 0
      if (ra !== rb) return ra - rb
      const regA = a.region ?? ''
      const regB = b.region ?? ''
      if (regA !== regB) return String(regA).localeCompare(String(regB))
      return String(a.id).localeCompare(String(b.id))
    })
}

/**
 * Re-run finalize effects for every final game (in round order).
 * Refetches each game before applying so round-2+ slots filled by earlier finals are current.
 * @returns {{ processed: number, errors: string[], total: number }}
 */
export async function refinalizeAllFinalGames(supabase, games) {
  const list = sortFinalGamesForReplay(games)
  const errors = []
  let processed = 0
  for (const g of list) {
    try {
      const fresh = await fetchSmGameWithTeamsById(supabase, g.id)
      if (!fresh || fresh.status !== 'final') continue
      await refinalizeFinalGame(supabase, fresh)
      processed++
    } catch (e) {
      errors.push(`${g.id}: ${e?.message || String(e)}`)
    }
  }
  return {
    processed,
    errors,
    total: list.length,
  }
}

/**
 * Rebuild ownership from draft picks, clear transfers, reset bracket advancement & eliminations,
 * then replay every final game in order (fixes wrong steals and wrong advancement).
 *
 * Draft baseline: latest draft pick per team (`acquired_round = 1` and no steal — `transferred_from_player_id` null).
 *
 * **Shared data:** `sm_teams.is_eliminated` and `sm_games` (round > 1 slots, winner/cover) are global
 * for all pools on this database — other game instances see the same bracket.
 */
export async function replayFinalsFromDraftBaseline(supabase, gameInstanceId) {
  if (!supabase || !gameInstanceId) {
    return { ok: false, error: 'Missing Supabase client or game instance id.' }
  }

  const { data: allOwnRows, error: draftErr } = await supabase
    .from('sm_ownership')
    .select('team_id, player_id, created_at, acquired_round, is_active')
    .eq('game_instance_id', gameInstanceId)

  if (draftErr) return { ok: false, error: draftErr.message }

  const byTeam = {}
  for (const row of allOwnRows || []) {
    const tid = row.team_id
    if (!tid) continue
    if (!byTeam[tid]) byTeam[tid] = []
    byTeam[tid].push(row)
  }

  const teamToPlayer = {}
  for (const tid of Object.keys(byTeam)) {
    const rows = byTeam[tid]
    const ar1 = rows
      .filter((r) => Number(r.acquired_round) === 1 && r.transferred_from_player_id == null)
      .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    if (ar1.length === 0) continue
    const lastDraft = ar1[ar1.length - 1]
    const hasActive = rows.some((r) => r.is_active === true)
    // Unassigned at draft: only an inactive round-1 row and nothing active for this team.
    if (!hasActive && lastDraft.is_active === false) continue
    if (lastDraft.player_id) teamToPlayer[tid] = lastDraft.player_id
  }

  const entries = Object.entries(teamToPlayer)
  if (entries.length === 0) {
    return {
      ok: false,
      error:
        'No draft assignments could be reconstructed (need sm_ownership with acquired_round = 1, or teams are all unassigned).',
    }
  }

  const { error: delOwnErr } = await supabase.from('sm_ownership').delete().eq('game_instance_id', gameInstanceId)
  if (delOwnErr) return { ok: false, error: delOwnErr.message }

  const inserts = entries.map(([team_id, player_id]) => ({
    game_instance_id: gameInstanceId,
    team_id,
    player_id,
    acquired_round: 1,
    is_active: true,
  }))
  const { error: insErr } = await supabase.from('sm_ownership').insert(inserts)
  if (insErr) return { ok: false, error: insErr.message }

  const { error: delTeErr } = await supabase.from('sm_transfer_events').delete().eq('game_instance_id', gameInstanceId)
  if (delTeErr) return { ok: false, error: delTeErr.message }

  const { data: allTeams, error: teamsErr } = await supabase.from('sm_teams').select('id')
  if (teamsErr) return { ok: false, error: teamsErr.message }
  const teamIds = (allTeams || []).map((t) => t.id)
  if (teamIds.length) {
    const { error: elimErr } = await supabase.from('sm_teams').update({ is_eliminated: false }).in('id', teamIds)
    if (elimErr) return { ok: false, error: elimErr.message }
  }

  const ts = new Date().toISOString()
  const { error: clearSlotsErr } = await supabase
    .from('sm_games')
    .update({ team1_id: null, team2_id: null, updated_at: ts })
    .gt('round', 1)
  if (clearSlotsErr) return { ok: false, error: clearSlotsErr.message }

  const { data: allGameRows, error: gameIdsErr } = await supabase.from('sm_games').select('id')
  if (gameIdsErr) return { ok: false, error: gameIdsErr.message }
  const gameIds = (allGameRows || []).map((r) => r.id)
  if (gameIds.length) {
    const { error: clearCoverErr } = await supabase
      .from('sm_games')
      .update({ winner_team_id: null, cover_team_id: null, updated_at: ts })
      .in('id', gameIds)
    if (clearCoverErr) return { ok: false, error: clearCoverErr.message }
  }

  const games = await fetchSmGamesWithTeams(supabase)
  const ordered = sortFinalGamesForReplay(games)
  const errors = []
  let processed = 0
  for (const g of ordered) {
    try {
      const fresh = await fetchSmGameWithTeamsById(supabase, g.id)
      if (!fresh || fresh.status !== 'final') continue
      await refinalizeFinalGame(supabase, fresh)
      processed++
    } catch (e) {
      errors.push(`${g.id}: ${e?.message || String(e)}`)
    }
  }

  return {
    ok: true,
    processed,
    total: ordered.length,
    errors,
    draftTeamsRestored: entries.length,
  }
}
