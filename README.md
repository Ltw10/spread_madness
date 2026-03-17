# Spread Madness

A bracket tracker for March Madness where advancement is determined by **covering the spread**, not just winning. Each team is owned by a player. If an underdog loses but covers the spread, their owner **steals** the winning team. Built with React, Vite, Tailwind, and Supabase.

---

## For developers: run locally

### 1. Clone and install

```bash
git clone <repo-url>
cd spread_madness
npm install
```

### 2. Environment

Copy the example env and add your Supabase credentials:

```bash
cp .env.example .env
```

Edit `.env`:

- **VITE_SUPABASE_URL** — Your Supabase project URL (e.g. `https://your-project.supabase.co`).
- **VITE_SUPABASE_ANON_KEY** — Your Supabase **anon public** API key (not the service_role key).

To find these: [Supabase](https://supabase.com) → your project → **Project Settings** → **API** → Project URL and anon public key.

Restart the dev server after changing `.env`.

### 3. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the contents of `supabase/schema.sql`. This creates all tables (with the `sm_` prefix), RLS policies, and realtime. No separate seed file; teams are seeded from the ESPN API when the app first loads and `sm_teams` is empty.

### 4. Run the app

```bash
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173/` or `http://localhost:5173/spread_madness/` depending on your Vite base).

### 5. Deploy to GitHub Pages

1. **Repo name** — Your GitHub repo should be named `spread_madness` (or change `base` in `vite.config.js` to match your repo name, e.g. `base: '/my-repo-name/'` for production).

2. **Build and push the site** (from your project root):
   ```bash
   npm run deploy
   ```
   This runs `npm run build` and pushes the `dist` folder to the `gh-pages` branch.

3. **Turn on GitHub Pages** — On GitHub: **Settings → Pages**. Under “Build and deployment”:
   - **Source:** Deploy from a branch
   - **Branch:** `gh-pages` / `(root)`
   - Save.

4. **Open the app** — After a minute or two it will be at:
   - `https://<your-username>.github.io/spread_madness/`
   (Use your repo name in the path if it’s not `spread_madness`.)

---

## For users: how to start a game

1. **Open the app** — The bracket page loads first. If the database has no teams yet, the app will seed teams from ESPN when you visit (may take a moment). Spreads fill from ESPN when the app is open; no API key needed.

2. **Draft** — Go to **Draft**.
   - Add players (name, emoji, color).
   - Drag each team from the region lists onto a player. You can use **Revert last move** to undo.
   - When every team is assigned, click **Submit Draft**. This saves ownership and locks the draft.

3. **Bracket** — Return to **Bracket**. You’ll see matchups by round and region. Each game shows the spread (and, after the draft, which player owns each team). Live scores update about every 60 seconds while the app is open.

4. **Admin** (if you have access):
   - **Create Bracket** — If the bracket is empty but you have teams, this creates the full 63-game bracket. The app can also auto-create the bracket when you have 32+ teams and no games.
   - **Finalize** — When a game is finished, use Finalize on that matchup so the winner advances and ownership updates (including steals when the underdog covers).
   - **Reset for new game** — Clears ownership, transfer history, and unlocks the draft so you can run a new draft. Leaves the bracket (games and spreads) intact.

**Flow in short:** Add players → assign all teams on Draft → Submit Draft → use Bracket to follow games and spreads; use Admin to finalize games and (optionally) reset for another season.
