import { useState } from 'react'
import { AdminPanel } from '../components/AdminPanel'
import { supabase } from '../lib/supabase'
import { verifyPassword } from '../lib/passwordHash'

const STORAGE_KEY = 'spread_madness_admin'

export function AdminPage() {
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(() => !!sessionStorage.getItem(STORAGE_KEY))
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!password.trim()) return
    try {
      let valid = false
      if (supabase) {
        const { data } = await supabase.from('sm_config').select('value').eq('key', 'admin_password_hash').maybeSingle()
        const hash = data?.value ?? ''
        valid = hash ? await verifyPassword(password, hash) : password === 'admin'
      } else {
        valid = password === 'admin'
      }
      if (valid) {
        sessionStorage.setItem(STORAGE_KEY, '1')
        setAuthenticated(true)
        setError('')
      } else {
        setError('Wrong password.')
      }
    } catch (err) {
      setError(err?.message || 'Login failed.')
    }
  }

  const handleLogout = () => {
    sessionStorage.removeItem(STORAGE_KEY)
    setAuthenticated(false)
    setPassword('')
  }

  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <form onSubmit={handleLogin} className="w-full max-w-xs rounded-xl border border-slate-600 bg-slate-900 p-6">
          <h1 className="font-display text-xl text-slate-100">Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Password required</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mt-4 w-full rounded border border-slate-600 bg-slate-800 px-3 py-2 text-slate-200 placeholder-slate-500"
          />
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          <button type="submit" className="mt-4 w-full rounded bg-violet-600 py-2 text-white hover:bg-violet-500">
            Log in
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6">
      <AdminPanel onLogout={handleLogout} />
    </div>
  )
}
