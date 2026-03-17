import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { createBracket } from '../lib/createBracket'

/**
 * When there are no games but there are enough teams, create the full bracket once
 * so the Bracket page can show the bracket before the draft is submitted.
 */
export function useCreateBracketWhenEmpty(games, reloadGames) {
  const attemptedRef = useRef(false)

  useEffect(() => {
    console.log('[bracket] useCreateBracketWhenEmpty effect: games.length =', games?.length ?? 0, 'attempted =', attemptedRef.current)
    if (games.length > 0) {
      attemptedRef.current = false
      return
    }
    if (!supabase || !reloadGames) {
      console.log('[bracket] useCreateBracketWhenEmpty: skip (no supabase or reloadGames)')
      return
    }
    if (attemptedRef.current) {
      console.log('[bracket] useCreateBracketWhenEmpty: skip (already attempted)')
      return
    }
    attemptedRef.current = true

    let cancelled = false
    ;(async () => {
      console.log('[bracket] useCreateBracketWhenEmpty: fetching team count...')
      const { data: teams } = await supabase.from('sm_teams').select('id').eq('is_eliminated', false)
      const teamCount = teams?.length ?? 0
      console.log('[bracket] useCreateBracketWhenEmpty: teams (non-eliminated) =', teamCount)
      if (cancelled || !teams || teams.length < 32) {
        console.log('[bracket] useCreateBracketWhenEmpty: not creating bracket (need 32+ teams, got', teamCount, ')')
        return
      }
      console.log('[bracket] useCreateBracketWhenEmpty: calling createBracket...')
      const result = await createBracket(supabase)
      console.log('[bracket] useCreateBracketWhenEmpty: createBracket result =', result)
      if (cancelled || result.error) return
      console.log('[bracket] useCreateBracketWhenEmpty: reloading games...')
      await reloadGames()
    })()
    return () => { cancelled = true }
  }, [games.length, reloadGames])
}
