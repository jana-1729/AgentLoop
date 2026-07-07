"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import {
  HeartPulse,
  Send,
  ArrowLeft,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Loader2,
} from "lucide-react";

type Rating = "green" | "yellow" | "red";

interface Card {
  id: string;
  name: string;
  price: number;
  restaurant: string;
  rating: Rating;
  carbs_g: number;
  sugar_g: number;
  protein_g: number;
  gi: string;
  reasons: string[];
  swaps: string[];
}

interface Order {
  orderId: string;
  items: { name: string; price: number }[];
  total: number;
  etaMins: number;
  totalCarbs_g: number;
  note: string;
}

interface Msg {
  role: "user" | "assistant";
  content: string;
  cards?: Card[] | null;
  order?: Order | null;
}

const SEED_PROMPTS = [
  "Order a high-protein lunch, keep my sugar low",
  "I really feel like biryani for dinner",
  "Something light from Dosa Junction?",
  "I want dessert 🍮",
];

const ratingStyles: Record<Rating, { dot: string; chip: string; label: string }> = {
  green: { dot: "bg-emerald-500", chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", label: "On target" },
  yellow: { dot: "bg-amber-500", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400", label: "Go easy" },
  red: { dot: "bg-rose-500", chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400", label: "Over budget" },
};

export default function DemoPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi Ravi 👋 I'm AgentLoop. Tell me what you're craving and I'll order it from Swiggy—kept within your diabetic carb budget. Try a prompt below.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    setError(null);

    const nextMessages: Msg[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setMessages([
        ...nextMessages,
        { role: "assistant", content: data.reply || "", cards: data.cards, order: data.order },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setMessages(nextMessages);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 glass border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <p className="font-bold">
                Agent<span className="gradient-text">Loop</span>
              </p>
              <p className="text-xs text-muted-foreground">Diabetic ordering · demo</p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
        </div>
        {/* Profile guardrail bar */}
        <div className="mx-auto max-w-3xl px-4 pb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-3 py-1 font-medium">
            <ShieldCheck className="h-3.5 w-3.5" /> Guardrail: Type 2 Diabetes
          </span>
          <span className="rounded-full bg-secondary text-secondary-foreground px-3 py-1 font-medium">
            Carb budget 45g / meal
          </span>
          <span className="rounded-full bg-secondary text-secondary-foreground px-3 py-1 font-medium">
            Added sugar &lt; 10g
          </span>
        </div>
      </header>

      {/* Chat */}
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
          {messages.map((m, i) => (
            <div key={i} className="space-y-3">
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-card border border-border rounded-bl-md"
                  }`}
                >
                  {m.content}
                </div>
              </div>

              {/* Scored dish cards */}
              {m.cards && m.cards.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {m.cards.map((c) => (
                    <DishCard key={c.id} card={c} onOrder={() => send(`Please order: ${c.name}`)} disabled={loading} />
                  ))}
                </div>
              )}

              {/* Order confirmation */}
              {m.order && <OrderCard order={m.order} />}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl bg-card border border-border px-4 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> AgentLoop is checking the menu…
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div ref={endRef} />
        </div>
      </main>

      {/* Composer */}
      <footer className="sticky bottom-0 z-20 glass border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-3">
          {messages.length <= 1 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {SEED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  disabled={loading}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell AgentLoop what you're craving…"
              className="flex-1 rounded-full border border-border bg-card px-4 h-11 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
              aria-label="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            <Sparkles className="inline h-3 w-3 mr-1" />
            Demo · mocked Swiggy data · simulated orders · not medical advice
          </p>
        </div>
      </footer>
    </div>
  );
}

function DishCard({ card, onOrder, disabled }: { card: Card; onOrder: () => void; disabled: boolean }) {
  const s = ratingStyles[card.rating];
  return (
    <div className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} />
            <h4 className="font-semibold text-sm">{card.name}</h4>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{card.restaurant} · ₹{card.price}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.chip}`}>{s.label}</span>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[11px]">
        <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{card.carbs_g}g carbs</span>
        <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{card.sugar_g}g sugar</span>
        <span className="rounded-md bg-muted px-2 py-0.5 font-medium">{card.protein_g}g protein</span>
        <span className="rounded-md bg-muted px-2 py-0.5 font-medium">GI: {card.gi}</span>
      </div>

      {card.reasons.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {card.reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}

      {card.swaps.length > 0 && (
        <div className="text-xs">
          <span className="text-muted-foreground">Swap → </span>
          {card.swaps.map((sw, i) => (
            <span key={i} className="text-primary font-medium">
              {sw}
              {i < card.swaps.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={onOrder}
        disabled={disabled}
        className="mt-auto rounded-full border border-primary/40 text-primary text-xs font-semibold py-1.5 hover:bg-primary/5 transition-colors disabled:opacity-50"
      >
        Order this
      </button>
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <div className="gradient-border rounded-2xl">
      <div className="rounded-2xl bg-card p-5">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <h4 className="font-semibold">Order placed · {order.orderId}</h4>
        </div>
        <ul className="mt-3 space-y-1 text-sm">
          {order.items.map((it, i) => (
            <li key={i} className="flex justify-between">
              <span>{it.name}</span>
              <span className="text-muted-foreground">₹{it.price}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 border-t border-border pt-3 flex items-center justify-between text-sm">
          <span className="font-semibold">Total ₹{order.total}</span>
          <span className="text-muted-foreground">{order.totalCarbs_g}g carbs · ETA {order.etaMins} min</span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">{order.note}</p>
      </div>
    </div>
  );
}
