import type { ScoredItem, PlacedOrder } from "./types";
import * as mock from "./swiggy-mock";

/**
 * Rails abstraction. The agent talks to this interface only — it never knows
 * whether dishes come from fixtures or the live Swiggy MCP servers.
 *
 * Guardrail scoring (our IP) always happens on OUR side, so both providers
 * return already-scored items. Swapping rails = flip SWIGGY_MCP_URL.
 */
export interface SwiggyProvider {
  searchMenu(query: string): Promise<ScoredItem[]>;
  placeOrder(itemNamesOrIds: string[]): Promise<PlacedOrder>;
}

const mockProvider: SwiggyProvider = {
  async searchMenu(query) {
    return mock.searchMenu(query);
  },
  async placeOrder(itemNamesOrIds) {
    const ids = mock.resolveItems(itemNamesOrIds).map((i) => i.id);
    return mock.placeOrder(ids);
  },
};

// Live Swiggy MCP is loaded lazily so the MCP SDK is never bundled/initialised
// unless SWIGGY_MCP_URL is configured. Falls back to mock on any failure.
const realProvider: SwiggyProvider = {
  async searchMenu(query) {
    const { swiggyMcp } = await import("./swiggy-mcp");
    return swiggyMcp.searchMenu(query);
  },
  async placeOrder(itemNamesOrIds) {
    const { swiggyMcp } = await import("./swiggy-mcp");
    return swiggyMcp.placeOrder(itemNamesOrIds);
  },
};

export function getSwiggy(): SwiggyProvider {
  return process.env.SWIGGY_MCP_URL ? realProvider : mockProvider;
}

export function providerMode(): "mock" | "live-mcp" {
  return process.env.SWIGGY_MCP_URL ? "live-mcp" : "mock";
}
