#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const STEAM_API_KEY = process.env.STEAM_API_KEY ?? "";
const STORE_API = "https://store.steampowered.com/api";
const STEAM_API = "https://api.steampowered.com";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5 MB

// ── Types ────────────────────────────────────────────────────────────────────

interface SteamTag {
  id: string;
  description: string;
}

interface SearchResult {
  id: number;
  name: string;
  price?: string;
  platforms: string[];
}

interface AppDetails {
  name: string;
  appid: number;
  short_description: string;
  detailed_description: string;
  developers: string[];
  publishers: string[];
  release_date: { coming_soon: boolean; date: string };
  genres?: SteamTag[];
  categories?: SteamTag[];
  metacritic?: { score: number; url: string };
  recommendations?: { total: number };
  platforms: { windows: boolean; mac: boolean; linux: boolean };
  website?: string;
  header_image: string;
  price_overview?: { final_formatted: string; discount_percent: number };
}

interface OwnedGame {
  appid: number;
  name?: string;
  playtime_forever: number;
  playtime_2weeks?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function minutesToHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Redact the Steam API key from a URL before using it in error messages
 * so it is never exposed in logs or MCP responses.
 */
function sanitizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (u.searchParams.has("key")) {
      u.searchParams.set("key", "[REDACTED]");
    }
    return u.toString();
  } catch {
    return "[invalid url]";
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "mcp-steam/1.0.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    // Network errors may contain the URL — sanitize before re-throwing.
    const label = err instanceof Error && err.name === "TimeoutError"
      ? `Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`
      : "Network error";
    throw new Error(`${label} (${sanitizeUrl(url)})`);
  }

  if (!res.ok) {
    // sanitizeUrl strips the API key from the URL included in the error.
    throw new Error(`HTTP ${res.status} — ${res.statusText} (${sanitizeUrl(url)})`);
  }

  const contentLength = res.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
    throw new Error("Steam API response exceeds size limit");
  }

  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error("Steam API response exceeds size limit");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Steam API returned invalid JSON");
  }
}

// ── Tool implementations ─────────────────────────────────────────────────────

async function searchGames(query: string, limit: number): Promise<string> {
  const url = `${STORE_API}/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=US`;
  const data = await fetchJson<{
    total: number;
    items: Array<{
      id: number;
      name: string;
      price?: { final_formatted: string };
      platforms: { windows?: boolean; mac?: boolean; linux?: boolean };
    }>;
  }>(url);

  if (!data.items || data.items.length === 0) {
    return `No games found for "${query}".`;
  }

  const results: SearchResult[] = data.items.slice(0, limit).map((item) => ({
    id: item.id,
    name: item.name,
    price: item.price?.final_formatted,
    platforms: [
      item.platforms?.windows ? "Windows" : null,
      item.platforms?.mac ? "Mac" : null,
      item.platforms?.linux ? "Linux" : null,
    ].filter(Boolean) as string[],
  }));

  const lines = results.map((r, i) => {
    const platforms = r.platforms.length ? r.platforms.join(", ") : "Unknown";
    const price = r.price ?? "Free / N/A";
    return `${i + 1}. **${r.name}** (AppID: ${r.id})\n   Price: ${price} | Platforms: ${platforms}`;
  });

  return `Found ${data.total} result(s) for "${query}" (showing ${results.length}):\n\n${lines.join("\n\n")}`;
}

async function getGameDetails(appid: number): Promise<string> {
  const url = `${STORE_API}/appdetails?appids=${appid}&cc=US&l=english`;
  const data = await fetchJson<Record<string, { success: boolean; data?: AppDetails }>>(url);

  const entry = data[String(appid)];
  if (!entry?.success || !entry.data) {
    return `Could not retrieve details for AppID ${appid}. The game may not exist or may be region-locked.`;
  }

  const d = entry.data;

  const price = d.price_overview
    ? d.price_overview.discount_percent > 0
      ? `${d.price_overview.final_formatted} (${d.price_overview.discount_percent}% off)`
      : d.price_overview.final_formatted
    : "Free to Play";

  const reviews = d.recommendations?.total
    ? `${d.recommendations.total.toLocaleString()} recommendations`
    : "No review data";

  const metacritic = d.metacritic
    ? `Metacritic: ${d.metacritic.score}/100 — ${d.metacritic.url}`
    : "No Metacritic score";

  const platforms = [
    d.platforms.windows ? "Windows" : null,
    d.platforms.mac ? "Mac" : null,
    d.platforms.linux ? "Linux" : null,
  ].filter(Boolean).join(", ") || "Unknown";

  const description = stripHtml(d.short_description ?? d.detailed_description ?? "").slice(0, 400);

  // genres and categories are {id, description} objects in the Steam API response
  const genres = d.genres?.map((g) => g.description).join(", ") ?? "N/A";
  const categories = d.categories?.slice(0, 5).map((c) => c.description).join(", ") ?? "N/A";

  const releaseDate = d.release_date?.coming_soon ? "Coming soon" : (d.release_date?.date ?? "N/A");

  return [
    `## ${d.name} (AppID: ${d.appid})`,
    ``,
    `**Price:** ${price}`,
    `**Developer(s):** ${d.developers?.join(", ") ?? "N/A"}`,
    `**Publisher(s):** ${d.publishers?.join(", ") ?? "N/A"}`,
    `**Release date:** ${releaseDate}`,
    `**Platforms:** ${platforms}`,
    `**Genres:** ${genres}`,
    `**Categories:** ${categories}`,
    `**Reviews:** ${reviews}`,
    metacritic,
    ``,
    `**Description:**`,
    description + (description.length === 400 ? "…" : ""),
    ``,
    `**Store page:** https://store.steampowered.com/app/${d.appid}/`,
    d.website ? `**Website:** ${d.website}` : null,
  ].filter((l) => l !== null).join("\n");
}

async function getOwnedGames(steamid: string, sortBy: "playtime" | "name"): Promise<string> {
  if (!STEAM_API_KEY) {
    return (
      "Error: STEAM_API_KEY environment variable is not set.\n" +
      "An API key is required to fetch owned games.\n" +
      "Get yours at https://steamcommunity.com/dev/apikey"
    );
  }

  // The API key is a query parameter — sanitizeUrl() in fetchJson will redact it
  // from any error messages before they are returned to the caller.
  const url =
    `${STEAM_API}/IPlayerService/GetOwnedGames/v0001/` +
    `?key=${STEAM_API_KEY}&steamid=${steamid}&format=json` +
    `&include_appinfo=1&include_played_free_games=1`;

  const data = await fetchJson<{ response: { game_count?: number; games?: OwnedGame[] } }>(url);

  const { response } = data;
  if (!response || !response.games) {
    return (
      `No games found for SteamID ${steamid}.\n` +
      `Possible reasons:\n` +
      `  • The profile is private\n` +
      `  • The SteamID is invalid\n` +
      `  • The account owns no games`
    );
  }

  const games = [...response.games];

  if (sortBy === "playtime") {
    games.sort((a, b) => b.playtime_forever - a.playtime_forever);
  } else {
    games.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }

  const totalHours = Math.floor(games.reduce((s, g) => s + g.playtime_forever, 0) / 60);

  const top = games.slice(0, 25).map((g, i) => {
    const playtime = minutesToHours(g.playtime_forever);
    const recent =
      g.playtime_2weeks != null && g.playtime_2weeks > 0
        ? ` (${minutesToHours(g.playtime_2weeks)} last 2 weeks)`
        : "";
    return `${String(i + 1).padStart(2)}. **${g.name ?? `AppID ${g.appid}`}** — ${playtime}${recent}`;
  });

  return [
    `## Owned games for SteamID ${steamid}`,
    ``,
    `**Total games:** ${response.game_count ?? games.length}`,
    `**Total playtime:** ${totalHours.toLocaleString()} hours`,
    ``,
    `### Top ${top.length} games (sorted by ${sortBy}):`,
    ...top,
    games.length > 25
      ? `\n_… and ${games.length - 25} more games not shown._`
      : "",
  ].join("\n");
}

// ── Server setup ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "mcp-steam",
  version: "1.0.0",
});

server.tool(
  "search_games",
  "Search for games on Steam by name or keyword. Returns a list of matching games with AppIDs, prices, and platform info.",
  {
    query: z.string().min(1).max(200).describe("Search query (game name or keyword)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("Maximum number of results to return (default: 5, max: 20)"),
  },
  async ({ query, limit }) => {
    try {
      const text = await searchGames(query, limit);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error searching games: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_game_details",
  "Get detailed information about a Steam game by its AppID: price, description, reviews, Metacritic score, genres, platforms, and more.",
  {
    appid: z
      .number()
      .int()
      .positive()
      .max(9_999_999)
      .describe("Steam AppID of the game (e.g. 570 for Dota 2, 730 for CS2)"),
  },
  async ({ appid }) => {
    try {
      const text = await getGameDetails(appid);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error fetching game details: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_owned_games",
  "List all Steam games owned by a player using their 64-bit SteamID. Requires a Steam API key. The player's profile must be public.",
  {
    steamid: z
      .string()
      .regex(/^\d{17}$/, "SteamID must be a 17-digit number")
      .describe("64-bit SteamID of the player (e.g. 76561198000000000)"),
    sort_by: z
      .enum(["playtime", "name"])
      .default("playtime")
      .describe("Sort results by 'playtime' (most played first) or 'name' (alphabetical)"),
  },
  async ({ steamid, sort_by }) => {
    try {
      const text = await getOwnedGames(steamid, sort_by);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [{ type: "text", text: `Error fetching owned games: ${(err as Error).message}` }],
        isError: true,
      };
    }
  }
);

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("mcp-steam server running on stdio");
}

main().catch((err) => {
  // Log only the message, not the full error object, to avoid leaking stack traces or URLs.
  const message = err instanceof Error ? err.message : String(err);
  console.error("Fatal error:", message);
  process.exit(1);
});
