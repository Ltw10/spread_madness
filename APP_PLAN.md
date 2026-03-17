Spread Madness — App Plan
What It Does
A bracket tracker for your friend group where advancement is determined by covering the spread, not just winning. Each team is owned by a player. If an underdog loses but covers the spread, their owner steals ownership of the winning team going forward.

Tech Stack
LayerToolWhyFrontendReact + ViteFast, component-basedStylingTailwind CSSResponsive, utility-firstHostingGitHub PagesFree, deploys from repoDatabaseSupabaseReal-time updates, free tierScoresESPN public APIFree, no key neededSpreadsESPN scoreboard (DraftKings close line)Free, no key needed

Database Schema (Supabase)
All tables use the `sm_` prefix so the app can share a database with other projects.
sm_players — id, name, color (hex), avatar emoji
sm_teams — id, name, seed, region, espn_id, is_eliminated
sm_games — id, round, region, team1_id, team2_id, spread, spread_team_id (who's favored), team1_score, team2_score, status, winner_team_id, cover_team_id, next_game_id
sm_ownership — id, team_id, player_id, acquired_round, transferred_from_player_id, is_active
sm_config — key/value pairs for admin password, draft_locked flag, current round
sm_transfer_events — id, game_id, team_id, from_player_id, to_player_id, round (for feed)
The sm_ownership table is the heart of the app — one active row per team that gets updated whenever an underdog covers.

Spread Coverage Logic
favorite_margin = favorite_score - underdog_score

favorite covers → margin > spread (favorite's owner keeps team)
underdog covers → margin < spread (underdog's owner STEALS the winning team)
push → margin === spread (no ownership change)

Pages & Components
Bracket Page (main view, public)

Full 68-team visual bracket, color-coded by owner
Hover any team → tooltip shows owner name + when they acquired it
Live scores update every 60 seconds via ESPN API
Spread displayed on each matchup before game tips
Ownership transfer events highlighted (e.g. "🔥 Stolen by Jake — Round 3")

Leaderboard Sidebar

Players ranked by teams still alive
Shows each player's color, remaining teams, and eliminated count

Draft Page (pre-tournament, admin only)

All 68 teams displayed in a grid by region/seed
Admin drags each team card onto a player slot
"Lock Draft" button freezes assignments and reveals the bracket

Admin Panel (password-gated)

Spreads fill from ESPN scoreboard when app polls for scores
Auto-score sync status + manual "Sync Now" button
Finalize game button → runs coverage logic → updates ownership → advances bracket
Manual score override for corrections

Key Data Flows
PRE-GAME
ESPN scoreboard (with odds) → auto-sync when app is open → spread saved to games table

DURING GAME
ESPN API polls every 60s → live scores shown on bracket

GAME ENDS
Admin clicks "Finalize Game" →
app calculates who covered →
ownership table updated (if stolen) →
winner advances to next_game_id slot →
bracket updates live for all viewers via Supabase Realtime

Ownership Transfer Example

Duke (-8.5) vs Vermont. Vermont loses 72-68 — only a 4-point margin. Vermont covers the spread. Vermont's owner (Sarah) now owns Duke going into the Sweet 16. Duke's original owner (Mike) loses the team.

GitHub Pages Deployment

Vite base config set to /your-repo-name/
npm run deploy → builds and pushes to gh-pages branch automatically
Supabase anon key safe to expose client-side (with Row Level Security enabled)
No spread API key needed; ESPN scoreboard includes DraftKings close line

Build Phases
Phase 1 — Foundation → Vite/React scaffold, Supabase tables, .env setup, GitHub Pages deploy pipeline
Phase 2 — Draft → Player management UI, team grid, drag-to-assign, lock draft
Phase 3 — Bracket View → Visual bracket with color-coded ownership, seed/region layout
Phase 4 — Live Data → ESPN score polling and spread sync, live score display
Phase 5 — Game Logic → Finalize game flow, spread coverage calculation, ownership transfer, bracket advancement
Phase 6 — Polish → Leaderboard, transfer history feed, mobile responsive, animations

File Structure
/src
/components — Bracket, GameMatchup, Leaderboard, DraftBoard, AdminPanel
/hooks — useGames, useOwnership, usePlayers, useScores, useAdmin
/lib — supabase.js, espnApi.js, spreadLogic.js
/pages — BracketPage, DraftPage, AdminPage
/supabase
schema.sql — run once in Supabase SQL editor
seed_teams.sql — 2025 tournament teams
.env.example — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
