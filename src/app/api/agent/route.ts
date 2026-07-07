import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, type FunctionDeclaration } from "@google/genai";
import { getSwiggy } from "@/lib/demo/provider";
import { demoProfile } from "@/lib/demo/profile";
import type { ScoredItem, PlacedOrder } from "@/lib/demo/types";

export const runtime = "nodejs";

const MODEL = "gemini-2.5-flash";

const systemInstruction = `You are AgentLoop, an agentic health-commerce assistant that orders food on Swiggy for a user managing a health condition.

USER PROFILE:
- Name: ${demoProfile.name}
- Condition: ${demoProfile.condition}
- Per-meal carb budget: ${demoProfile.mealCarbBudget_g}g
- Added-sugar limit: ${demoProfile.addedSugarLimit_g}g per meal
- Goal: ${demoProfile.goal}

HOW YOU WORK:
1. Use the search_menu tool to find dishes. Every dish comes back pre-scored by our guardrail as green/yellow/red with reasons and swap suggestions.
2. Recommend GREEN items first. For RED items, warn briefly and offer the suggested swap.
3. Build a balanced meal within the carb budget (e.g. a protein + a low-GI carb + a side). State the approximate total carbs.
4. Once the user confirms what they want, call place_order immediately with the item names they said. Do NOT re-run search_menu to "verify" availability — place_order resolves names itself. Never claim an item is unavailable.
5. Be concise, warm, and specific. Use grams, not vague claims. Never invent nutrition numbers — rely on the tool's scores.
6. You are a wellness aid, not a doctor. If asked for medical advice, gently defer to their doctor.`;

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_menu",
        description: "Search Swiggy restaurants/dishes by free text (cuisine, dish, or intent like 'healthy lunch'). Returns dishes pre-scored against the user's health profile.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "What to search for, e.g. 'high protein lunch' or 'south indian'" },
          },
          required: ["query"],
        },
      },
      {
        name: "place_order",
        description: "Place a (simulated) Swiggy order for the given dishes. Only call after the user confirms.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              description: "Dish names or ids to order",
              items: { type: Type.STRING },
            },
          },
          required: ["items"],
        },
      },
    ] as FunctionDeclaration[],
  },
];

function brief(s: ScoredItem) {
  return {
    id: s.item.id,
    name: s.item.name,
    price: s.item.price,
    restaurant: s.restaurantName,
    rating: s.rating,
    carbs_g: s.nutrition.carbs_g,
    sugar_g: s.nutrition.sugar_g,
    protein_g: s.nutrition.protein_g,
    gi: s.nutrition.gi,
    reasons: s.reasons,
    swaps: s.swaps,
  };
}

interface ChatMessage { role: "user" | "assistant"; content: string }

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not set. Add it to .env.local and restart the dev server." },
      { status: 500 }
    );
  }

  let messages: ChatMessage[] = [];
  try {
    const body = await req.json();
    messages = body.messages ?? [];
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey });
  const swiggy = getSwiggy();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contents: any[] = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  let cards: ReturnType<typeof brief>[] | null = null;
  let order: PlacedOrder | null = null;

  try {
    for (let step = 0; step < 6; step++) {
      const resp = await ai.models.generateContent({
        model: MODEL,
        contents,
        config: { systemInstruction, tools },
      });

      const calls = resp.functionCalls;
      if (!calls || calls.length === 0) {
        return NextResponse.json({ reply: resp.text ?? "", cards, order });
      }

      // Record the model's tool-call turn.
      const modelParts = resp.candidates?.[0]?.content?.parts ?? [];
      contents.push({ role: "model", parts: modelParts });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const responseParts: any[] = [];
      for (const call of calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = (call.args ?? {}) as any;
        let result: unknown;

        if (call.name === "search_menu") {
          const scored = await swiggy.searchMenu(String(args.query ?? ""));
          cards = scored.map(brief);
          result = { items: cards };
        } else if (call.name === "place_order") {
          const names: string[] = Array.isArray(args.items) ? args.items.map(String) : [];
          order = await swiggy.placeOrder(names);
          result = order;
        } else {
          result = { error: `Unknown tool ${call.name}` };
        }

        responseParts.push({ functionResponse: { name: call.name, response: result as object } });
      }

      contents.push({ role: "user", parts: responseParts });
    }

    // Fell through the loop without a text reply.
    return NextResponse.json({ reply: "Let me know if you'd like me to place the order.", cards, order });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Agent error: ${message}` }, { status: 500 });
  }
}
