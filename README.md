# mcp-steam

[![npm version](https://img.shields.io/npm/v/mcp-steam.svg?style=flat-square)](https://www.npmjs.com/package/mcp-steam)
[![npm downloads](https://img.shields.io/npm/dm/mcp-steam.svg?style=flat-square)](https://www.npmjs.com/package/mcp-steam)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/node/v/mcp-steam.svg?style=flat-square)](https://nodejs.org)

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for the Steam API. Connect any MCP-compatible client to search games, retrieve detailed information, and list a player's owned games.

---

## Features

| Tool | Description |
|---|---|
| `search_games` | Search Steam by name or keyword, returns AppIDs, prices, platforms |
| `get_game_details` | Full details for a game: price, description, Metacritic, genres, reviews |
| `get_owned_games` | All games owned by a Steam player (requires API key + public profile) |

---

## Requirements

- **Node.js 18+**
- A **Steam Web API key** for the `get_owned_games` tool — get one free at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)

> `search_games` and `get_game_details` use the public Steam Store API and do **not** require an API key.

---

## Installation

### With npx (recommended)

Add this to your MCP client configuration file:

```json
{
  "mcpServers": {
    "steam": {
      "command": "npx",
      "args": ["-y", "mcp-steam"],
      "env": {
        "STEAM_API_KEY": "YOUR_STEAM_API_KEY"
      }
    }
  }
}
```

### Global install

```bash
npm install -g mcp-steam
```

Then reference it in your MCP config:

```json
{
  "mcpServers": {
    "steam": {
      "command": "mcp-steam",
      "env": {
        "STEAM_API_KEY": "YOUR_STEAM_API_KEY"
      }
    }
  }
}
```

---

## Tools

### `search_games`

Search Steam for games by name or keyword.

**Parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `query` | string | yes | — | Search query (game name or keyword) |
| `limit` | number | no | `5` | Max results (1–20) |

**Example prompt:**
> Search for "hollow knight" on Steam

**Example response:**
```
Found 12 result(s) for "hollow knight" (showing 5):

1. **Hollow Knight** (AppID: 367520)
   Price: $14.99 | Platforms: Windows, Mac, Linux

2. **Hollow Knight: Voidheart Edition** (AppID: 851710)
   Price: $19.99 | Platforms: Windows, Mac, Linux
...
```

---

### `get_game_details`

Get full details for a game by its Steam AppID.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `appid` | number | yes | Steam AppID (e.g. `570` for Dota 2, `730` for CS2) |

**Example prompt:**
> Give me the details of Elden Ring on Steam (AppID 1245620)

**Example response:**
```
## Elden Ring (AppID: 1245620)

**Price:** $59.99
**Developer(s):** FromSoftware Inc.
**Publisher(s):** Bandai Namco Entertainment
**Release date:** Feb 25, 2022
**Platforms:** Windows
**Genres:** Action, RPG
**Reviews:** 722,984 recommendations
Metacritic: 95/100

**Description:**
THE NEW FANTASY ACTION RPG. Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring...

**Store page:** https://store.steampowered.com/app/1245620/
```

---

### `get_owned_games`

List all games owned by a Steam player. The player's profile **must be set to public**. Requires a Steam API key.

**Parameters:**

| Name | Type | Required | Default | Description |
|---|---|---|---|---|
| `steamid` | string | yes | — | 17-digit 64-bit SteamID |
| `sort_by` | string | no | `"playtime"` | Sort by `"playtime"` or `"name"` |

**How to find a SteamID:**
- Visit [steamidfinder.com](https://www.steamidfinder.com) or [steamid.io](https://steamid.io)
- Or open a profile URL: `https://steamcommunity.com/id/USERNAME` → look for the 17-digit ID

**Example prompt:**
> Show me the games owned by SteamID 76561198000000000, sorted by playtime

**Example response:**
```
## Owned games for SteamID 76561198000000000

**Total games:** 312
**Total playtime:** 8,453 hours

### Top 25 games (sorted by playtime):
 1. **Counter-Strike 2** — 1,204h (3h 22min last 2 weeks)
 2. **Dota 2** — 987h
 3. **The Witcher 3: Wild Hunt** — 342h
...
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `STEAM_API_KEY` | For `get_owned_games` | Your Steam Web API key |

---

## Development

```bash
# Clone and install
git clone https://github.com/naouts/mcp-steam.git
cd mcp-steam
npm install

# Build
npm run build

# Run locally
STEAM_API_KEY=your_key node dist/index.js

# Watch mode (rebuilds on change)
npm run build && npm run dev
```

### Project structure

```
mcp-steam/
├── src/
│   └── index.ts      # Server + all tools
├── dist/             # Compiled output (git-ignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Publishing to npm

```bash
# Make sure you're logged in
npm login

# Dry-run to verify what gets published
npm publish --dry-run

# Publish
npm publish
```

---

## License

MIT — see [LICENSE](LICENSE)
