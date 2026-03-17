import { useState } from 'react'
import { useAdmin } from '../hooks/useAdmin'
import { useGames } from '../hooks/useGames'
import { runScoreSyncOnce } from '../hooks/useAutoScoreSync'
import { supabase } from '../lib/supabase'
import { GameMatchup } from './GameMatchup'

export function AdminPanel({ onLogout }) {
  const { config, setConfigValue, finalizeGame, createBracket, resetForNewGame, error: adminError } = useAdmin()
  const { games, reload: reloadGames } = useGames()
  const [syncResult, setSyncResult] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [bracketResult, setBracketResult] = useState(null)
  const [finalizeModal, setFinalizeModal] = useState(null)
  const [overrideScores, setOverrideScores] = useState({ team1: '', team2: '' })
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetAlsoPlayers, setResetAlsoPlayers] = useState(false)
  const [resetResult, setResetResult] = useState(null)

  const draftLocked = config.draft_locked === 'true'

  const handleFinalize = async (game) => {
    const t1 = overrideScores.team1 !== '' ? parseInt(overrideScores.team1, 10) : game.team1_score
    const t2 = overrideScores.team2 !== '' ? parseInt(overrideScores.team2, 10) : game.team2_score
    if (typeof t1 !== 'number' || typeof t2 !== 'number') return
    try {
      await finalizeGame(game, t1, t2)
      setFinalizeModal(null)
      setOverrideScores({ team1: '', team2: '' })
    } catch (e) {
      setSyncResult({ error: e.message })
    }
  }

  const inProgressGames = games.filter((g) => g.status === 'in_progress')
  const scheduledGames = games.filter((g) => g.status === 'scheduled')

  return (
    <div className="space-y-6 rounded-xl border border-slate-600 bg-slate-900/90 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl text-slate-100">Admin Panel</h2>
        {onLogout && (
          <button type="button" onClick={onLogout} className="rounded bg-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-500">
            Logout
          </button>
        )}
      </div>

      {adminError && <p className="text-sm text-red-400">{adminError}</p>}

      <section>
        <h3 className="font-body font-medium text-slate-300">Bracket</h3>
        <p className="text-xs text-slate-400">Create the full bracket (all 6 rounds, 63 games) and assign teams to Round 1 matchups. Requires teams in the database—they are seeded from ESPN when you first open the app if empty.</p>
        <button
          type="button"
          onClick={async () => {
            setBracketResult(null)
            try {
              const r = await createBracket()
              setBracketResult(r)
            } catch (e) {
              setBracketResult({ error: e.message })
            }
          }}
          className="mt-1 rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
        >
          Create Bracket
        </button>
        {bracketResult && (
          <p className="mt-2 text-sm text-slate-400">
            {bracketResult.error ? bracketResult.error : `Created ${bracketResult.created ?? 0} games.`}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Scores</h3>
        <p className="text-xs text-slate-400">ESPN polls every 60s. Use this to fetch scores from ESPN and save to the database now (e.g. if auto-polling isn’t updating).</p>
        <button
          type="button"
          disabled={syncing || !games?.length}
          onClick={async () => {
            setSyncResult(null)
            setSyncing(true)
            try {
              const result = await runScoreSyncOnce(supabase, games, reloadGames)
              setSyncResult(result.error ? { error: result.error } : { updated: result.updated ?? 0 })
            } catch (e) {
              setSyncResult({ error: e?.message || 'Sync failed' })
            } finally {
              setSyncing(false)
            }
          }}
          className="mt-1 rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500 disabled:opacity-60"
        >
          {syncing ? 'Refreshing…' : 'Refresh scores now'}
        </button>
        {syncResult && (
          <p className="mt-2 text-sm text-slate-400">
            {syncResult.error ? <span className="text-red-400">{syncResult.error}</span> : `Updated ${syncResult.updated ?? 0} game(s).`}
          </p>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Draft</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draftLocked}
            onChange={(e) => setConfigValue('draft_locked', e.target.checked ? 'true' : 'false')}
          />
          <span className="text-sm text-slate-300">Draft locked</span>
        </label>
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Reset for new game</h3>
        <p className="text-xs text-slate-400">Clear all bracket and draft data so you can run a fresh draft (e.g. after testing). Teams stay; you can re-draft. Optionally clear players too.</p>
        {!resetConfirm ? (
          <button
            type="button"
            onClick={() => setResetConfirm(true)}
            className="mt-1 rounded border border-amber-600/60 bg-amber-900/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-800/40"
          >
            Reset for new game…
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={resetAlsoPlayers}
                onChange={(e) => setResetAlsoPlayers(e.target.checked)}
              />
              <span className="text-sm text-slate-300">Also clear players (empty roster for real game)</span>
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  setResetResult(null)
                  const r = await resetForNewGame(resetAlsoPlayers)
                  setResetResult(r)
                  setResetConfirm(false)
                  setResetAlsoPlayers(false)
                  if (r.ok) window.location.reload()
                }}
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500"
              >
                Yes, reset everything
              </button>
              <button
                type="button"
                onClick={() => { setResetConfirm(false); setResetAlsoPlayers(false); setResetResult(null); }}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
              >
                Cancel
              </button>
            </div>
            {resetResult && (
              <p className="text-sm text-slate-400">{resetResult.error ? resetResult.error : 'Reset complete. You can run a new draft.'}</p>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-body font-medium text-slate-300">Finalize games</h3>
        <div className="mt-2 space-y-2">
          {inProgressGames.length === 0 && <p className="text-sm text-slate-400">No games in progress.</p>}
          {inProgressGames.map((g) => (
            <div key={g.id} className="flex items-center gap-2">
              <GameMatchup
                game={g}
                team1={g.team1}
                team2={g.team2}
                spreadTeam={g.spread_team}
                score1={g.team1_score}
                score2={g.team2_score}
                status={g.status}
                isAdmin
                onFinalize={() => setFinalizeModal(g)}
              />
            </div>
          ))}
        </div>
      </section>

      {finalizeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-900 p-4">
            <h3 className="font-display text-slate-100">Finalize game</h3>
            <p className="mt-1 text-sm text-slate-400">
              {finalizeModal.team1?.name} vs {finalizeModal.team2?.name}
            </p>
            <div className="mt-3 flex gap-2">
              <input
                type="number"
                placeholder={String(finalizeModal.team1_score ?? '')}
                value={overrideScores.team1}
                onChange={(e) => setOverrideScores((s) => ({ ...s, team1: e.target.value }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
              />
              <input
                type="number"
                placeholder={String(finalizeModal.team2_score ?? '')}
                value={overrideScores.team2}
                onChange={(e) => setOverrideScores((s) => ({ ...s, team2: e.target.value }))}
                className="w-20 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => handleFinalize(finalizeModal)}
                className="rounded bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-500"
              >
                Finalize
              </button>
              <button
                type="button"
                onClick={() => { setFinalizeModal(null); setOverrideScores({ team1: '', team2: '' }); }}
                className="rounded bg-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-500"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
