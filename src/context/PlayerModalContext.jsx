import { createContext, useContext, useState } from 'react'

const PlayerModalContext = createContext(null)

export function usePlayerModal() {
  const ctx = useContext(PlayerModalContext)
  return ctx
}

export function PlayerModalProvider({ children }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const openPlayerCard = (player) => setSelectedPlayer(player ?? null)
  const closePlayerCard = () => setSelectedPlayer(null)
  return (
    <PlayerModalContext.Provider value={{ selectedPlayer, openPlayerCard, closePlayerCard }}>
      {children}
    </PlayerModalContext.Provider>
  )
}
