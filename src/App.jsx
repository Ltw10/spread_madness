import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { BracketPage } from './pages/BracketPage'
import { DraftPage } from './pages/DraftPage'
import { AdminPage } from './pages/AdminPage'
import { PlayerCard } from './components/PlayerCard'
import { PlayerModalProvider, usePlayerModal } from './context/PlayerModalContext'
import { useGames } from './hooks/useGames'
import { useAutoScoreSync } from './hooks/useAutoScoreSync'
import { useSeedTeamsIfEmpty } from './hooks/useSeedTeamsIfEmpty'

function Nav() {
  const iconSrc = `${import.meta.env.BASE_URL}bracket.png`
  return (
    <nav className="flex items-center gap-4 border-b border-slate-700 bg-slate-900/80 px-4 py-3">
      <Link
        to="/"
        className="mr-1 inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-500 bg-slate-600 text-slate-200 hover:bg-slate-500"
        aria-label="Bracket"
        title="Bracket"
      >
        <img
          src={iconSrc}
          alt=""
          className="h-5 w-5"
          aria-hidden
        />
      </Link>
      <Link to="/" className="font-body text-slate-300 hover:text-white">
        Bracket
      </Link>
      <Link to="/draft" className="font-body text-slate-300 hover:text-white">
        Draft
      </Link>
      <Link to="/admin" className="font-body text-slate-300 hover:text-white">
        Admin
      </Link>
    </nav>
  )
}

/** Runs on app load: seed teams from ESPN if sm_teams is empty; then score sync every 60s. */
function ScoreSyncRunner() {
  useSeedTeamsIfEmpty()
  const { games, reload } = useGames()
  useAutoScoreSync(games, reload)
  return null
}

function AppContent() {
  const { selectedPlayer } = usePlayerModal()
  return (
    <>
      <div className="min-h-screen bg-slate-950 text-slate-200">
        <ScoreSyncRunner />
        <Nav />
        <Routes>
        <Route path="/" element={<BracketPage />} />
        <Route path="/draft" element={<DraftPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
      </div>
      {selectedPlayer && <PlayerCard />}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <PlayerModalProvider>
        <AppContent />
      </PlayerModalProvider>
    </BrowserRouter>
  )
}
