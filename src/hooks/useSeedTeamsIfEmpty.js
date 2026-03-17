import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { fetchEspnTournamentTeams } from '../lib/espnApi'

/**
 * On app load, if sm_teams is empty, fetch tournament teams from ESPN and insert them.
 * Runs once per app load (idempotent: only runs when count is 0).
 */
export function useSeedTeamsIfEmpty() {
  const didRun = useRef(false)

  useEffect(() => {
    if (didRun.current || !supabase) return
    didRun.current = true

    async function run() {
      try {
        const { count, error } = await supabase.from('sm_teams').select('*', { count: 'exact', head: true })
        if (error || (count != null && count > 0)) return
        const teams = await fetchEspnTournamentTeams()
        if (!teams.length) return
        const rows = teams.map((t) => ({
          name: t.name,
          seed: t.seed,
          region: t.region || 'Unassigned',
          espn_id: t.espn_id,
          is_eliminated: false,
        }))
        await supabase.from('sm_teams').insert(rows)
      } catch (err) {
        console.warn('Seed teams from ESPN failed:', err)
      }
    }

    run()
  }, [])
}
