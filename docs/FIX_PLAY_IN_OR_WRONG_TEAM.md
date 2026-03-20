# Fix a Round of 64 team after play-in (or wrong placeholder)

The bracket is created from `sm_teams` **by seed within each region** (`createBracket.js`). For a line like **1 vs 16**, it picks whichever team row has `seed = 16` in that region. If the database still had the **play-in loser** (or a placeholder) when the bracket was built, that UUID stays on `sm_games.team1_id` / `team2_id` until you change it.

**`sm_games` is shared** across all pools on the same Supabase project—one fix updates the matchup for everyone.

---

## 1. Confirm the correct team in ESPN

Use the **event id** for the **Round of 64** game (not the play-in), or look up teams on the scoreboard response:

- Summary:  
  `GET https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=EVENT_ID`
- Note each side’s **`competitors[].id`** (ESPN team id) and **`displayName`**.

---

## 2. Find UUIDs in `sm_teams`

In **Supabase → Table Editor** or **SQL Editor**:

```sql
-- All teams in that region (adjust region name)
select id, name, seed, region, espn_id, is_eliminated
from sm_teams
where region = 'East'
order by seed, name;
```

Match **`espn_id`** to the ESPN competitor id from step 1. You want the **winner’s** row `id` (UUID).

- If the **winner is missing** from `sm_teams`, add them (or re-run whatever process seeds teams from ESPN) so you have a row with the correct `espn_id`, `name`, `seed`, `region`.

---

## 3. Find the Round of 64 game row

```sql
select g.id, g.round, g.region, g.team1_id, g.team2_id,
       t1.name as team1, t2.name as team2
from sm_games g
left join sm_teams t1 on t1.id = g.team1_id
left join sm_teams t2 on t2.id = g.team2_id
where g.round = 1
  and g.region = 'East'  -- your region
order by t1.seed nulls last, t2.seed nulls last;
```

Identify the row where one side is the **wrong** team (play-in loser).

---

## 4. Update the wrong side only

Replace placeholders with real UUIDs from step 2:

```sql
update sm_games
set
  team2_id = 'WINNER_TEAM_UUID'::uuid,  -- or team1_id — whichever slot is wrong
  updated_at = now()
where id = 'GAME_ROW_UUID'::uuid;
```

Do **not** change `id` or `next_game_id` unless you know you need to.

---

## 5. Clean up related fields (if the game was already played or synced)

If this game already has scores / finalization from ESPN against the **wrong** matchup:

- Reset or correct **`team1_score`**, **`team2_score`**, **`status`**, **`winner_team_id`**, **`cover_team_id`** to match reality, **or** use **Admin → refinalize / replay** after scores are right.
- If **`spread_team_id`** was set for the old pairing, refresh from ESPN (auto sync) or set it to the favored team’s `sm_teams.id` for the **new** pairing.

---

## 6. `sm_teams.is_eliminated`

- Set **`is_eliminated = true`** on the **play-in loser** if they should be out.
- Ensure the **winner** has **`is_eliminated = false`** (until they lose a later game).

---

## 7. Ownership (`sm_ownership`) — important

Swapping `team1_id` / `team2_id` on **`sm_games`** does **not** move draft picks.

- Picks are tied to **`sm_ownership.team_id`** → a specific **`sm_teams.id`**.
- If someone drafted the **loser’s** team row, they still “own” that row until you change ownership in the DB or they pick up a steal later.

If you need the pool to show the **winner’s** row as owned by the same player:

```sql
-- Example: move active ownership from loser row to winner row for one instance (dangerous if winner already has an owner — check first)
select * from sm_ownership
where game_instance_id = 'YOUR_INSTANCE_UUID'
  and team_id in ('LOSER_UUID', 'WINNER_UUID');
```

Only adjust after you’re sure there’s no conflict. Often it’s enough to fix **`sm_games`** for display and scoring; ownership is a separate business decision.

---

## Quick checklist

| Step | Action |
|------|--------|
| 1 | ESPN summary/scoreboard → correct **espn_id**s |
| 2 | `sm_teams` → winner’s **uuid** |
| 3 | `sm_games` `round=1` → find game **uuid** |
| 4 | `UPDATE sm_games` **team1_id** or **team2_id** |
| 5 | Scores/spread/status if already wrong |
| 6 | **`is_eliminated`** on loser/winner rows |
| 7 | **`sm_ownership`** only if you must reassign picks |

---

## After fixing teams/spread: apply winner & ownership

The app only moves **`sm_ownership`** (steals) and advances winners when **`finalizeGame`** runs — same path as ESPN auto-finalize.

**Easiest (Admin UI):**

1. In Supabase, set **`team1_score`** and **`team2_score`** to the real final scores (ints).
2. Leave **`winner_team_id`** and **`cover_team_id`** **null** if you haven’t finalized yet (or if you need to re-run effects).
3. Open **Admin → Finalize games**. The matchup appears if it is **`scheduled`** or **`in_progress`** with **both scores**, or **`final`** with scores but **no winner** yet.
4. Click **Finalize**, confirm scores, submit. That runs winner/cover/steal/advance/elimination.

**Alternatives:**

- **`final`** + both scores + **`winner_team_id` null** → leave the app open; score sync (every ~60s or **Refresh scores now** in Admin) runs a **repair** that calls finalize.
- Games already **`final`** with **`winner_team_id` set** but wrong side effects after you changed spread/scores → **Quick refinalize all final games** (Admin) to re-apply math on current scores/ownership.
- Game is **`final`** and **`winner_team_id` / `cover_team_id` are set** but **ownership / next round / elimination never updated** (e.g. columns edited only in SQL) → same fix: **Admin → Quick refinalize all final games** so `applyFinalizeEffects` runs again for every final game (in order). It won’t double-steal if the winner is already held by the correct underdog owner.
