import type { MenuItem, PlacedOrder, Restaurant, ScoredItem } from "./types";
import { restaurants } from "./fixtures/menus";
import { demoProfile } from "./profile";
import { scoreDish, summarizeCart } from "./guardrail";

/**
 * Mock implementation of the Swiggy MCP tool surface.
 * Each function mirrors a real MCP tool so the agent adapter can be swapped to
 * the live `mcp.swiggy.com/food` server later without touching the agent loop.
 */

function allItemsWithMeta(): { item: MenuItem; r: Restaurant }[] {
  return restaurants.flatMap((r) => r.items.map((item) => ({ item, r })));
}

// Mirrors Swiggy `search_restaurants` + `search_menu`: returns dishes matching a
// free-text query, each pre-scored by the guardrail against the demo profile.
export function searchMenu(query: string): ScoredItem[] {
  const q = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(Boolean);

  const matches = allItemsWithMeta().filter(({ item, r }) => {
    if (!terms.length) return true;
    const hay = `${item.name} ${item.description} ${item.category} ${r.cuisine}`.toLowerCase();
    // "healthy"/"low sugar"/"diabetic" are intent words, not menu words — match broadly.
    const intent = ["healthy", "low", "sugar", "diabetic", "light", "lunch", "dinner", "veg", "protein"];
    return terms.some((t) => hay.includes(t) || intent.includes(t));
  });

  const pool = matches.length ? matches : allItemsWithMeta();

  const scored = pool.map(({ item, r }) => scoreDish(item, demoProfile, r.id, r.name));

  // Surface the healthiest first — green, then yellow, then red.
  const rank: Record<string, number> = { green: 0, yellow: 1, red: 2 };
  scored.sort((a, b) => rank[a.rating] - rank[b.rating] || a.nutrition.carbs_g - b.nutrition.carbs_g);
  return scored.slice(0, 8);
}

// Mirrors Swiggy `get_restaurant_menu`.
export function getRestaurantMenu(restaurantId: string): ScoredItem[] {
  const r = restaurants.find((x) => x.id === restaurantId);
  if (!r) return [];
  return r.items.map((item) => scoreDish(item, demoProfile, r.id, r.name));
}

// Mirrors Swiggy `place_food_order`. SIMULATED — never places a real order.
export function placeOrder(itemIds: string[]): PlacedOrder {
  const chosen: ScoredItem[] = [];
  for (const id of itemIds) {
    const found = allItemsWithMeta().find(({ item }) => item.id === id);
    if (found) chosen.push(scoreDish(found.item, demoProfile, found.r.id, found.r.name));
  }
  const total = chosen.reduce((s, i) => s + i.item.price, 0);
  const eta = chosen.length ? Math.max(...chosen.map((i) => restaurants.find((r) => r.id === i.restaurantId)?.etaMins ?? 30)) : 30;
  const { totalCarbs } = summarizeCart(chosen);

  return {
    orderId: `AL-DEMO-${itemIds.join("").slice(0, 6).toUpperCase() || "0000"}`,
    items: chosen.map((i) => ({ name: i.item.name, price: i.item.price })),
    total,
    etaMins: eta,
    totalCarbs_g: totalCarbs,
    note: "SIMULATED order — no real Swiggy order was placed.",
  };
}

// Base name without a trailing "(...)" qualifier, e.g. "Idli (2 pcs)" -> "idli".
function baseName(name: string): string {
  return name.toLowerCase().replace(/\(.*?\)/g, "").trim();
}

// Resolve item ids/names to menu items (used by the agent when placing orders).
// Handles exact ids/names AND free-text phrases that mention several dishes
// (e.g. "grilled chicken bowl with brown rice and a green salad").
export function resolveItems(idsOrNames: string[]): MenuItem[] {
  const all = allItemsWithMeta();
  const out: MenuItem[] = [];
  const seen = new Set<string>();
  const push = (item: MenuItem) => {
    if (!seen.has(item.id)) { out.push(item); seen.add(item.id); }
  };

  // Pass 1: exact id or exact name per token.
  for (const key of idsOrNames) {
    const k = key.toLowerCase().trim();
    const hit = all.find(({ item }) => item.id === key || item.name.toLowerCase() === k);
    if (hit) push(hit.item);
  }

  // Pass 2: scan the combined text for any dish name mentioned.
  const hay = idsOrNames.join(" | ").toLowerCase();
  for (const { item } of all) {
    if (seen.has(item.id)) continue;
    const full = item.name.toLowerCase();
    const base = baseName(item.name);
    if (hay.includes(full) || (base.length > 2 && hay.includes(base))) push(item);
  }

  return out;
}
