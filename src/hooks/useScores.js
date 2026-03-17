import { useState, useEffect, useCallback } from 'react'
import { fetchEspnScoreboard } from '../lib/espnApi'

const POLL_MS = 60 * 1000

export function useScores(paused = false) {
  const [scores, setScores] = useState({ games: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchScores = useCallback(async () => {
    try {
      const data = await fetchEspnScoreboard()
      setScores(data)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchScores()
    if (paused) return
    const interval = setInterval(fetchScores, POLL_MS)
    return () => clearInterval(interval)
  }, [fetchScores, paused])

  return { scores, loading, error, refresh: fetchScores }
}
