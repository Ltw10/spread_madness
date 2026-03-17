import { useState } from 'react'
import { useGame } from '../context/GameContext'

export function GameSelectPage() {
  const { games, gamesLoading, createGame, setCurrentGameId, getGameForUnlock, unlockGame } = useGame()
  const [name, setName] = useState('')
  const [gamePassword, setGamePassword] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [gameToUnlock, setGameToUnlock] = useState(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState('')
  const [unlocking, setUnlocking] = useState(false)

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    if (!name.trim()) {
      setError('Enter a name for your game.')
      return
    }
    if (!gamePassword.trim()) {
      setError('Game password is required.')
      return
    }
    setCreating(true)
    try {
      await createGame(name.trim(), gamePassword, adminPassword)
      setName('')
      setGamePassword('')
      setAdminPassword('')
    } catch (err) {
      setError(err?.message || 'Failed to create game.')
    } finally {
      setCreating(false)
    }
  }

  const handleGameClick = async (gameId) => {
    const game = await getGameForUnlock(gameId)
    if (!game) return
    if (!game.needsPassword) {
      setCurrentGameId(gameId)
      return
    }
    setGameToUnlock({ id: gameId, name: game.name })
    setUnlockPassword('')
    setUnlockError('')
  }

  const handleUnlockSubmit = async (e) => {
    e.preventDefault()
    if (!gameToUnlock) return
    setUnlockError('')
    setUnlocking(true)
    try {
      const result = await unlockGame(gameToUnlock.id, unlockPassword)
      if (result.ok) {
        setGameToUnlock(null)
      } else {
        setUnlockError(result.error || 'Wrong password')
      }
    } finally {
      setUnlocking(false)
    }
  }

  if (gamesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-slate-400">Loading games…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <h1 className="font-display text-3xl tracking-wide text-white">Spread Madness</h1>
      <p className="mt-1 font-body text-slate-400">Select a game to play or create a new one.</p>

      {/* Game password modal */}
      {gameToUnlock && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" aria-hidden onClick={() => setGameToUnlock(null)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-600 bg-slate-900 p-4">
            <h2 className="font-display text-lg text-slate-100">Enter game password</h2>
            <p className="mt-1 text-sm text-slate-400">{gameToUnlock.name}</p>
            <form onSubmit={handleUnlockSubmit} className="mt-4 space-y-2">
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                placeholder="Password"
                className="w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
                autoFocus
              />
              {unlockError && <p className="text-sm text-red-400">{unlockError}</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={unlocking || !unlockPassword.trim()}
                  className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {unlocking ? 'Checking…' : 'Enter'}
                </button>
                <button
                  type="button"
                  onClick={() => setGameToUnlock(null)}
                  className="rounded bg-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-500"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      <section className="mt-8">
        <h2 className="font-display text-lg text-slate-200">Your games</h2>
        {games.length === 0 ? (
          <p className="mt-2 font-body text-sm text-slate-500">No games yet. Create one below.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {games.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => handleGameClick(g.id)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-3 text-left font-body text-slate-200 hover:bg-slate-700"
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg text-slate-200">Create game</h2>
        <p className="mt-1 text-xs text-slate-400">Game password is required and will be needed to open this game later.</p>
        <form onSubmit={handleCreate} className="mt-2 space-y-4">
          <div className="flex flex-wrap gap-4">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Game name"
              className="w-full min-w-0 max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 font-body text-slate-200 placeholder-slate-500"
            />
            <input
              type="password"
              value={gamePassword}
              onChange={(e) => setGamePassword(e.target.value)}
              placeholder="Game password (required)"
              className="w-full min-w-0 max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 font-body text-slate-200 placeholder-slate-500"
            />
          </div>
          <div>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Admin password"
              className="w-full max-w-xs rounded border border-slate-600 bg-slate-800 px-3 py-2 font-body text-slate-200 placeholder-slate-500"
            />
            <p className="mt-1 text-xs text-slate-500">Defaults to &quot;admin&quot; if not set.</p>
          </div>
          <div>
            <button
              type="submit"
              disabled={creating}
              className="rounded bg-emerald-600 px-4 py-2 font-body text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create game'}
            </button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </section>
    </div>
  )
}
