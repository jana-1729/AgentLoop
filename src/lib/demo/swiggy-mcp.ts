import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MenuItem, PlacedOrder, ScoredItem } from "./types";
import { demoProfile } from "./profile";
import { scoreDish, summarizeCart } from "./guardrail";

/**
 * LIVE Swiggy MCP adapter — mirrors the mock provider against the real
 * `mcp.swiggy.com/food` server (tools: search_menu, get_restaurant_menu,
 * update_food_cart, place_food_order, get_addresses …).
 *
 * ⚠️ UNVERIFIED: response shapes below are best-effort and MUST be confirmed
 * against the live API once Builders Club access is granted. Everything is
 * gated behind SWIGGY_MCP_URL, so this file is never exercised in the demo.
 *
 * Env:
 *   SWIGGY_MCP_URL    e.g. https://mcp.swiggy.com/food
 *   SWIGGY_MCP_TOKEN  OAuth 2.1 access token (obtained via PKCE flow, out of band)
 */

let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (clientPromise) return clientPromise;
  const url = process.env.SWIGGY_MCP_URL;
  const token = process.env.SWIGGY_MCP_TOKEN;
  if (!url) throw new Error("SWIGGY_MCP_URL not set");

  clientPromise = (async () => {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    });
    const client = new Client({ name: "agentloop", version: "0.1.0" });
    await client.connect(transport);
    return client;
  })();
  return clientPromise;
}

// MCP tool results arrive as { structuredContent } or a text content block.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(res: any): any {
  if (res?.structuredContent) return res.structuredContent;
  const text = res?.content?.find((c: { type: string }) => c.type === "text")?.text;
  if (typeof text === "string") {
    try { return JSON.parse(text); } catch { return { text }; }
  }
  return res;
}

// Map a raw Swiggy dish record → our MenuItem. TODO: confirm field names.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMenuItem(raw: any): { item: MenuItem; restaurantId: string; restaurantName: string } {
  const item: MenuItem = {
    id: String(raw.id ?? raw.itemId ?? raw.dishId ?? ""),
    name: String(raw.name ?? raw.title ?? ""),
    price: Number(raw.price ?? raw.finalPrice ?? 0),
    veg: Boolean(raw.isVeg ?? raw.veg ?? false),
    description: String(raw.description ?? ""),
    category: String(raw.category ?? raw.categoryName ?? "Menu"),
  };
  return {
    item,
    restaurantId: String(raw.restaurantId ?? raw.restId ?? ""),
    restaurantName: String(raw.restaurantName ?? raw.restName ?? ""),
  };
}

export const swiggyMcp = {
  async searchMenu(query: string): Promise<ScoredItem[]> {
    const client = await getClient();
    const res = await client.callTool({ name: "search_menu", arguments: { query } });
    const data = parseResult(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data.items ?? data.results ?? data.dishes ?? [];
    return rows
      .map(toMenuItem)
      .map(({ item, restaurantId, restaurantName }) =>
        scoreDish(item, demoProfile, restaurantId, restaurantName)
      );
  },

  async placeOrder(itemNamesOrIds: string[]): Promise<PlacedOrder> {
    const client = await getClient();
    // Real flow is two-step: build the cart, then place it.
    // TODO: resolve names→ids via search_menu/get_restaurant_menu first.
    await client.callTool({ name: "update_food_cart", arguments: { items: itemNamesOrIds } });
    const res = await client.callTool({ name: "place_food_order", arguments: {} });
    const data = parseResult(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items = (data.items ?? []).map((i: any) => ({
      name: String(i.name ?? ""),
      price: Number(i.price ?? 0),
    }));
    const scored = (data.items ?? []).map(toMenuItem).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ({ item, restaurantId, restaurantName }: any) => scoreDish(item, demoProfile, restaurantId, restaurantName)
    );
    return {
      orderId: String(data.orderId ?? data.id ?? "SWIGGY-ORDER"),
      items,
      total: Number(data.total ?? items.reduce((s: number, i: { price: number }) => s + i.price, 0)),
      etaMins: Number(data.etaMins ?? data.eta ?? 30),
      totalCarbs_g: summarizeCart(scored).totalCarbs,
      note: "Live Swiggy order.",
    };
  },
};
