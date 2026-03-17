/**
 * Create the full 63-game bracket (Round 1–6) with next_game_id links.
 * Idempotent: call when sm_games is empty and sm_teams has enough teams.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ created: number, error?: string }>}
 */
export async function createBracket(supabase) {
  console.log('[bracket] createBracket: start')
  if (!supabase) {
    console.log('[bracket] createBracket: no supabase')
    return { created: 0 }
  }
  const { data: teams } = await supabase.from('sm_teams').select('id, name, seed, region').eq('is_eliminated', false)
  const teamCount = teams?.length ?? 0
  console.log('[bracket] createBracket: teams =', teamCount)
  if (!teams?.length) {
    console.log('[bracket] createBracket: abort, no teams')
    return { created: 0, error: 'No teams found. Open the app once so teams can be seeded from ESPN, or add teams manually.' }
  }
  const byRegion = {}
  teams.forEach((t) => {
    if (!byRegion[t.region]) byRegion[t.region] = []
    byRegion[t.region].push(t)
  })
  const regionOrder = ['East', 'West', 'South', 'Midwest']
  const matchups = [
    [1, 16], [8, 9], [5, 12], [4, 13], [6, 11], [3, 14], [7, 10], [2, 15],
  ]

  const { data: r6 } = await supabase.from('sm_games').insert({ round: 6, status: 'scheduled' }).select('id').single()
  if (r6?.id == null) {
    console.log('[bracket] createBracket: failed to create round 6')
    return { created: 0, error: 'Failed to create championship game' }
  }
  console.log('[bracket] createBracket: round 6 ok')
  const champId = r6.id

  const { data: r5Rows } = await supabase.from('sm_games').insert([
    { round: 5, status: 'scheduled', next_game_id: champId },
    { round: 5, status: 'scheduled', next_game_id: champId },
  ]).select('id')
  if (!r5Rows || r5Rows.length !== 2) return { created: 0, error: 'Failed to create Final Four games' }
  const [r5EastWestId, r5SouthMidId] = r5Rows.map((r) => r.id)

  const { data: r4Rows } = await supabase.from('sm_games').insert(
    regionOrder.map((region, i) => ({
      round: 4,
      region,
      status: 'scheduled',
      next_game_id: i < 2 ? r5EastWestId : r5SouthMidId,
    }))
  ).select('id')
  if (!r4Rows || r4Rows.length !== 4) return { created: 0, error: 'Failed to create Elite 8 games' }
  const r4ByRegion = {}
  regionOrder.forEach((r, i) => { r4ByRegion[r] = r4Rows[i].id })

  const r3Inserts = []
  regionOrder.forEach((region) => {
    r3Inserts.push({ round: 3, region, status: 'scheduled', next_game_id: r4ByRegion[region] })
    r3Inserts.push({ round: 3, region, status: 'scheduled', next_game_id: r4ByRegion[region] })
  })
  const { data: r3Rows } = await supabase.from('sm_games').insert(r3Inserts).select('id')
  if (!r3Rows || r3Rows.length !== 8) return { created: 0, error: 'Failed to create Sweet 16 games' }
  const r3ByRegion = { East: [r3Rows[0].id, r3Rows[1].id], West: [r3Rows[2].id, r3Rows[3].id], South: [r3Rows[4].id, r3Rows[5].id], Midwest: [r3Rows[6].id, r3Rows[7].id] }

  const r2Inserts = []
  regionOrder.forEach((region) => {
    const r3Ids = r3ByRegion[region]
    for (let i = 0; i < 4; i++) r2Inserts.push({ round: 2, region, status: 'scheduled', next_game_id: r3Ids[Math.floor(i / 2)] })
  })
  const { data: r2Rows } = await supabase.from('sm_games').insert(r2Inserts).select('id')
  if (!r2Rows || r2Rows.length !== 16) return { created: 0, error: 'Failed to create Round of 32 games' }
  const r2ByRegion = {}
  regionOrder.forEach((region, ri) => {
    r2ByRegion[region] = r2Rows.slice(ri * 4, ri * 4 + 4).map((r) => r.id)
  })

  const r1Inserts = []
  const r1NextGameIds = []
  for (const region of regionOrder) {
    const regionTeams = byRegion[region]
    if (!regionTeams?.length) continue
    const sorted = [...regionTeams].sort((a, b) => a.seed - b.seed)
    const bySeed = {}
    sorted.forEach((t) => { bySeed[t.seed] = t })
    const r2Ids = r2ByRegion[region] || []
    for (let i = 0; i < matchups.length; i++) {
      const [s1, s2] = matchups[i]
      const t1 = bySeed[s1]
      const t2 = bySeed[s2]
      if (t1 && t2) {
        r1Inserts.push({ round: 1, region, team1_id: t1.id, team2_id: t2.id, status: 'scheduled' })
        r1NextGameIds.push(r2Ids[Math.floor(i / 2)] ?? null)
      }
    }
  }
  if (r1Inserts.length === 0) {
    console.log('[bracket] createBracket: no round 1 inserts (regions may have no teams?)')
    return { created: 0 }
  }
  console.log('[bracket] createBracket: inserting round 1, rows =', r1Inserts.length)
  const { data: r1Rows, error: e1 } = await supabase.from('sm_games').insert(r1Inserts).select('id')
  if (e1 || !r1Rows?.length) {
    console.log('[bracket] createBracket: round 1 insert failed', e1?.message)
    return { created: 0, error: e1?.message || 'Failed to create Round 1 games' }
  }

  for (let i = 0; i < r1Rows.length && i < r1NextGameIds.length; i++) {
    const nextId = r1NextGameIds[i]
    if (nextId) await supabase.from('sm_games').update({ next_game_id: nextId, updated_at: new Date().toISOString() }).eq('id', r1Rows[i].id)
  }

  const totalCreated = 1 + 2 + 4 + 8 + 16 + r1Inserts.length
  console.log('[bracket] createBracket: done, created =', totalCreated)
  return { created: totalCreated }
}
