# ESPN API — Example Request & Response

Use this to verify the **response shape** for the two scoreboard calls the app uses: live scores (and game status) and tournament teams (for seeding `sm_teams`). **No API key required.**

---

## Endpoints used by sync

The auto sync (`useAutoScoreSync`) runs on page load and every 60s. It hits these two endpoints:

| Purpose | URL |
|--------|-----|
| **Scores + spreads (current games)** | `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard` |
| **Spreads (tournament games)** | Same base URL with `?groups=100&limit=500` and **per-date** `&dates=YYYYMMDD` (see below) |

- The first is the default scoreboard (no query params); it returns a small “current” window of games. Used for live scores, finalize, and spread updates for those games.
- The tournament sync fetches the calendar from the initial `?groups=100&limit=500` call, then requests **each tournament date** with `?groups=100&limit=500&dates=YYYYMMDD` and merges events. That way the full round (and entire tournament) is covered instead of only the First Four / current window.

---

## 1. Scoreboard (live scores & status)

Used for: live score display, auto-finalize when a game is completed, and matching our games to ESPN by team id/name.

### Request

**Endpoint:** `GET /apis/site/v2/sports/basketball/mens-college-basketball/scoreboard`

**Optional query params:** `dates=YYYYMMDD` (filter by date), `groups=100` (tournament), `limit=500`

### cURL (default — current/relevant games, used by sync for scores + spreads)

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
```

### cURL (tournament — single call returns only a small window, e.g. First Four)

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=500"
```

### cURL (tournament for a specific date — sync uses this for each tournament day to get entire round)

```bash
# Example: Round of 64 day (adjust YYYYMMDD to tournament dates from the calendar in the first response)
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=500&dates=20260319"
```

---

## Response shape (scoreboard)

The response is a **JSON object** with `leagues`, `events`, and optionally `day`:

```json
{
  "leagues": [{ "id": "41", "name": "NCAA Men's Basketball", ... }],
  "day": { "date": "2026-03-17" },
  "events": [
    {
      "id": "401856435",
      "uid": "s:40~l:41~e:401856435",
      "date": "2026-03-17T22:40Z",
      "name": "UMBC Retrievers at Howard Bison",
      "shortName": "UMBC VS HOW",
      "season": { "year": 2026, "type": 3, "slug": "post-season" },
      "competitions": [
        {
          "id": "401856435",
          "date": "2026-03-17T22:40Z",
          "type": { "id": "6", "abbreviation": "TRNMNT" },
          "competitors": [
            {
              "id": "47",
              "team": {
                "id": "47",
                "location": "Howard",
                "name": "Bison",
                "abbreviation": "HOW",
                "displayName": "Howard Bison",
                "shortDisplayName": "Howard"
              },
              "score": "0",
              "winner": false,
              "curatedRank": { "current": 16 }
            },
            {
              "id": "2378",
              "team": {
                "id": "2378",
                "location": "UMBC",
                "name": "Retrievers",
                "displayName": "UMBC Retrievers",
                "shortDisplayName": "UMBC"
              },
              "score": "0",
              "winner": false,
              "curatedRank": { "current": 16 }
            }
          ],
          "notes": [
            { "type": "event", "headline": "NCAA Men's Basketball Championship - Midwest Region - First Four" }
          ]
        }
      ],
      "status": {
        "type": {
          "id": "1",
          "name": "STATUS_SCHEDULED",
          "state": "pre",
          "completed": false,
          "description": "Scheduled"
        }
      }
    }
  ]
}
```

### Top-level fields we use

| Field     | Type  | Description |
|-----------|-------|-------------|
| `events`  | array | List of games. Each event has one competition with two competitors. |

### Per-event fields (what we use)

| Field                | Type   | Description |
|----------------------|--------|-------------|
| `id`                 | string | Event id (we don’t store; used for matching). |
| `date`               | string | ISO 8601 game time. |
| `name`               | string | e.g. "UMBC Retrievers at Howard Bison". |
| `competitions[0]`    | object | Single competition (the matchup). |
| `status.type.name`   | string | **Game status:** `STATUS_SCHEDULED`, `STATUS_IN_PROGRESS`, `STATUS_FINAL` / `completed` — we use this to auto-finalize. |

### Per-competitor (team in a game)

| Field                    | Type   | Description |
|--------------------------|--------|-------------|
| `id`                     | string | **ESPN team id — we store as `sm_teams.espn_id` and use for score matching.** |
| `team.displayName`       | string | **Full name — we use for `sm_teams.name` and matching.** |
| `team.shortDisplayName`  | string | Short name (e.g. "Howard", "UMBC"). |
| `team.id`                | string | Same as competitor `id`. |
| `score`                  | string | Current score (string, e.g. `"72"`). |
| `winner`                 | boolean| `true` when game is final and this team won. |
| **`curatedRank.current`**| number | **Tournament seed (1–16) — we use for `sm_teams.seed` when seeding from ESPN.** |

### Spread (from scoreboard odds)

The scoreboard response can include **DraftKings odds** per event under `competitions[0].odds[0]`. We use the **"close"** point spread to populate `sm_games.spread` and `sm_games.spread_team_id`:

| Path | Description |
|------|--------------|
| `competitions[0].odds[0].pointSpread.home.close.line` | Home spread line (e.g. `"+1.5"` or `"-1.5"`). |
| `competitions[0].odds[0].pointSpread.away.close.line` | Away spread line. |
| `competitions[0].odds[0].homeTeamOdds.favorite` | `true` if home is favored. |
| `competitions[0].odds[0].awayTeamOdds.favorite` | `true` if away is favored. |

We store the **favorite’s line** (negative number, e.g. `-1.5` or `-27.5`) and the favored team’s `sm_teams.id` as `spread_team_id`. The sync runs with the same scoreboard fetch used for scores, so spreads update automatically when the app is open.

**Cover math:** compare the favorite’s **scoring margin** (favorite points − underdog points) to **`|spread|`** (absolute value). Example: Duke −27.5 wins 71–65 → margin 6 &lt; 27.5 → **underdog covers**; Duke still wins the game, so the underdog’s owner can steal Duke. Do **not** compare margin directly to the negative stored line (6 &gt; −27.5 would incorrectly imply the favorite covered).

### Region (tournament only)

| Location              | Description |
|-----------------------|-------------|
| `competitions[0].notes` | Array of notes. One note has `headline` like `"NCAA Men's Basketball Championship - Midwest Region - First Four"`. |
| We parse **region** with the regex `\b(East|West|South|Midwest)\s+Region\b` and use it for `sm_teams.region`. |

---

## 2. Tournament teams (for seeding `sm_teams`)

When `sm_teams` is empty, the app calls the scoreboard with **`?groups=100&limit=500`** to get tournament games, then:

- Collects unique teams by **competitor id** (no duplicates).
- For each: **`espn_id`** = competitor id, **`name`** = `team.displayName`, **`seed`** = `curatedRank.current`, **`region`** = parsed from `competitions[0].notes[].headline`.

So the **same response shape** as above applies; the only difference is the query params and that we iterate all events and dedupe by team id.

---

## Minimal “one event” example (for copy/paste checks)

Single event, trimmed to the bits we care about for **scores + status**:

```json
{
  "id": "401856435",
  "date": "2026-03-17T22:40Z",
  "name": "UMBC Retrievers at Howard Bison",
  "competitions": [
    {
      "competitors": [
        {
          "id": "47",
          "team": { "id": "47", "displayName": "Howard Bison", "shortDisplayName": "Howard" },
          "score": "0",
          "winner": false,
          "curatedRank": { "current": 16 }
        },
        {
          "id": "2378",
          "team": { "id": "2378", "displayName": "UMBC Retrievers", "shortDisplayName": "UMBC" },
          "score": "0",
          "winner": false,
          "curatedRank": { "current": 16 }
        }
      ],
      "notes": [{ "headline": "NCAA Men's Basketball Championship - Midwest Region - First Four" }]
    }
  ],
  "status": { "type": { "name": "STATUS_SCHEDULED", "completed": false } }
}
```

For **tournament team seeding**, the same event gives us two teams: Howard Bison (id 47, seed 16, region Midwest) and UMBC Retrievers (id 2378, seed 16, region Midwest). Compare `team.displayName` and `id` to your `sm_teams.name` and `sm_teams.espn_id` to verify matching.

---

## 3. Single game — summary API (manual DB fixes)

**No API key.** Use the ESPN **event id** (same as scoreboard `events[].id`). You can read it from a game URL on ESPN, e.g. `.../game/_/gameId/401825400` → `401825400`.

### Request

```bash
# Replace EVENT_ID (e.g. 401825400)
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=EVENT_ID" | jq .
```

(`site.web.api.espn.com` with the same path usually works too if you hit CORS or caching issues in a browser.)

### Where to read values for `sm_games` / `sm_teams`

| What you need | JSON path (typical) |
|---------------|---------------------|
| Game status | `header.competitions[0].status.type.name` (e.g. `STATUS_FINAL`) |
| Per-team ESPN id | `header.competitions[0].competitors[].id` → match `sm_teams.espn_id` |
| Scores | `header.competitions[0].competitors[].score` (strings → integers in DB) |
| Winner | `header.competitions[0].competitors[].winner` (`true` on one side) |
| Spread (close line) | `pickcenter[0].pointSpread.home.close.line` and `.away.close.line` |
| Who is favored | `pickcenter[0].homeTeamOdds.favorite` / `awayTeamOdds.favorite` |

The app stores **`spread`** as the **favorite’s** closing line (negative number) and **`spread_team_id`** as the internal UUID of the favored team whose `espn_id` matches the favorite side (`homeTeamOdds` / `awayTeamOdds` tie to home/away competitors by `homeAway`).

### If `pickcenter` is empty

Use the **tournament scoreboard** for that game day (includes `competitions[0].odds[0]` like §Spread above):

```bash
curl -s "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=500&dates=YYYYMMDD" | jq '.events[] | select(.id=="EVENT_ID")'
```

Swap `YYYYMMDD` for the game’s local tournament day and `EVENT_ID` for the same id.

---

## Status values (for auto-finalize)

We treat a game as **final** when `event.status.type.name` (or equivalent) indicates completion. Typical values:

| Status name         | Meaning      | We auto-finalize? |
|---------------------|-------------|-------------------|
| `STATUS_SCHEDULED`  | Not started | No                |
| `STATUS_IN_PROGRESS`| Live        | No                |
| `STATUS_FINAL`      | Completed   | Yes               |
| `completed`         | Completed   | Yes               |

We normalize by lowercasing and checking for `"final"` or `"completed"` in the status string.
