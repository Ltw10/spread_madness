import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { usePlayerModal } from '../context/PlayerModalContext'

export function TransferFeed({ limit = 10 }) {
  const { openPlayerCard } = usePlayerModal()
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!supabase) return
    async function load() {
      const { data } = await supabase
        .from('sm_transfer_events')
        .select(`
          id, round, created_at,
          team:sm_teams(name),
          from_player:sm_players!sm_transfer_events_from_player_id_fkey(id, name, avatar_emoji, color),
          to_player:sm_players!sm_transfer_events_to_player_id_fkey(id, name, avatar_emoji, color)
        `)
        .order('created_at', { ascending: false })
        .limit(limit)
      setEvents(data || [])
    }
    load()
    const sub = supabase.channel('transfer_feed').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sm_transfer_events' }, load).subscribe()
    return () => { sub.unsubscribe() }
  }, [limit])

  if (events.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-600 bg-slate-900/60 p-3">
      <h3 className="font-display text-sm uppercase tracking-wide text-slate-400">Recent steals</h3>
      <ul className="mt-2 space-y-1">
        {events.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-sm text-slate-300">
            <span className="text-amber-400">🔥</span>
            <button type="button" onClick={() => e.to_player && openPlayerCard(e.to_player)} className="font-medium hover:underline text-left" style={{ color: e.to_player?.color }}>{e.to_player?.avatar_emoji} {e.to_player?.name}</button>
            <span> stole {e.team?.name} from </span>
            <button type="button" onClick={() => e.from_player && openPlayerCard(e.from_player)} className="font-medium hover:underline text-left text-slate-300">{e.from_player?.avatar_emoji} {e.from_player?.name}</button>
            <span className="text-slate-500">R{e.round}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
