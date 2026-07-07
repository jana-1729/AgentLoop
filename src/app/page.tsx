"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  ShoppingCart,
  LineChart,
  Stethoscope,
  Mic,
  Utensils,
  Salad,
  Cpu,
  HeartPulse,
  ChevronRight,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import Navbar from "@/components/navbar";
import Hero from "@/components/hero";
import LogosBar from "@/components/logos-bar";
import { Button } from "@/components/ui/button";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: "easeOut" as const },
  viewport: { once: true },
};

const features = [
  {
    title: "Guardrail Brain",
    description:
      "Every dish and product scored 🟢🟡🔴 against your health goal—with the why, and a smarter swap.",
    icon: ShieldCheck,
  },
  {
    title: "Agentic Ordering",
    description:
      "Order by chat or voice. AgentLoop searches, swaps, and places the order on Swiggy for you.",
    icon: Zap,
  },
  {
    title: "Grocery Autopilot",
    description:
      "Never run out. Budget-capped weekly restock from Instamart with condition-safe substitutions.",
    icon: ShoppingCart,
  },
  {
    title: "Outcome Loop",
    description:
      "Correlate what you ate with your sugar, weight, and vitals. Learn the exact dishes that spike you.",
    icon: LineChart,
  },
  {
    title: "Dietician-Reviewed Rules",
    description:
      "Condition rule-sets built with clinicians. Wellness guidance you can share with your doctor.",
    icon: Stethoscope,
  },
  {
    title: "Voice-First & Vernacular",
    description:
      "Order in plain Hindi or English by speaking—built for parents and elders, not just app-natives.",
    icon: Mic,
  },
];

const steps = [
  {
    title: "Set your health goal",
    description:
      "Pick your condition and targets. We build a dietician-reviewed guardrail around your carbs, sugar, sodium, and calories.",
  },
  {
    title: "Order through AgentLoop",
    description:
      "Chat or speak. We search Swiggy, Instamart, and Dineout and correct every order to your goal before it's placed.",
  },
  {
    title: "It guards, delivers & learns",
    description:
      "On-target food arrives. Outcomes feed back so guidance sharpens with every order you make.",
  },
];

const channels = [
  {
    title: "WhatsApp",
    description:
      "Order and get guarded, on-target suggestions right inside a WhatsApp chat. No app to install.",
    icon: MessageCircle,
    status: "Pilot access",
    live: true,
  },
  {
    title: "Voice & Vernacular",
    description:
      "Speak your order in plain Hindi or English—built for parents and elders, not just app-natives.",
    icon: Mic,
    status: "Beta",
    live: true,
  },
  {
    title: "iOS & Android app",
    description:
      "Health dashboards, glucometer + Google Fit sync, and smart nudges in a native companion app.",
    icon: Smartphone,
    status: "Coming soon",
    live: false,
  },
];

const useCases = [
  "Type 2 Diabetes",
  "Prediabetes",
  "Weight Management",
  "PCOS",
  "Heart / BP / Cholesterol",
  "Thyroid",
  "Pregnancy Nutrition",
  "Kidney (Renal Diet)",
  "Fitness & High-Protein",
  "Eldercare Ordering",
  "Post-Surgery Recovery",
  "General Wellness",
];

const pricing = [
  {
    name: "Free",
    price: "₹0",
    description: "Start eating on target.",
    highlights: [
      "Health profile & goals",
      "Order scoring (food + grocery)",
      "3 guarded orders/day",
      "Community support",
    ],
  },
  {
    name: "Plus",
    price: "₹299",
    description: "For daily condition management.",
    highlights: [
      "Unlimited guarded orders",
      "Grocery autopilot",
      "Voice ordering",
      "Outcome tracking (Google Fit / glucometer)",
    ],
    featured: true,
  },
  {
    name: "Care",
    price: "Let’s talk",
    description: "For insurers, employers & clinics.",
    highlights: [
      "Cohort outcome dashboards",
      "Co-branded deployment",
      "Clinical rule customization",
      "Delegated / family ordering",
    ],
  },
];

const faqs = [
  {
    q: "Do you order the food, or just track it?",
    a: "Both. Unlike trackers, AgentLoop places the actual order on Swiggy and Instamart via Swiggy's MCP—corrected to your health goal.",
  },
  {
    q: "How do you know a dish's carbs or sugar?",
    a: "We estimate from the Indian Food Composition Tables plus packaged-goods labels, with conservative values and confidence flags. Common dishes are dietician-curated.",
  },
  {
    q: "Is this medical advice?",
    a: "No. AgentLoop is a wellness tool with dietician-reviewed rules. Always follow your doctor—and share our reports with them.",
  },
  {
    q: "Which platforms can it order from?",
    a: "Swiggy Food, Instamart, and Dineout today via Swiggy's MCP. More commerce rails as they open up.",
  },
  {
    q: "Can I manage my parent's orders?",
    a: "Yes. Delegated auth lets you run a family member's food and grocery on their behalf, with confirmations.",
  },
  {
    q: "Do I need a new app?",
    a: "Start on WhatsApp—no install. A companion app for dashboards and device sync is on the roadmap.",
  },
];

export default function Home() {
  return (
    <div className="bg-background text-foreground">
      <Navbar />
      <main>
        <Hero />
        <LogosBar />

        <section id="features" className="relative py-16 sm:py-24 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full bg-primary/10 blur-[160px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                Core capabilities
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Everything you need to eat on target
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                AgentLoop combines a guardrail brain, agentic ordering, and an
                outcome loop so every meal you order moves your health goal
                forward—without willpower.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.div
                    key={feature.title}
                    {...fadeUp}
                    className="group gradient-border rounded-2xl cursor-pointer"
                  >
                    <div className="h-full rounded-2xl bg-card/80 backdrop-blur-sm p-6 transition-transform duration-300 group-hover:-translate-y-1">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="mt-4 text-xl font-semibold">
                        {feature.title}
                      </h3>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how" className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-10 sm:gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <motion.div {...fadeUp}>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                How AgentLoop works
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                From health goal to on-target order
              </h2>
              <p className="mt-4 text-muted-foreground">
                Set it once. Then order like you always do—AgentLoop does the
                nutrition math, corrects the cart, and places the order for you.
              </p>
              <div className="mt-8 space-y-5">
                {steps.map((step, index) => (
                  <motion.div
                    key={step.title}
                    {...fadeUp}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    className="flex gap-4"
                  >
                    <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap gap-4">
                <Button className="rounded-full px-6">
                  Join the pilot
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="rounded-full px-6">
                  Read the thesis
                </Button>
              </div>
            </motion.div>

            <motion.div {...fadeUp} className="relative">
              <div className="absolute -top-10 -right-8 h-40 w-40 rounded-full bg-amber-300/20 blur-[80px] z-0 pointer-events-none" />
              <div className="gradient-border rounded-3xl">
                <div className="rounded-3xl bg-card/90 p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Live order guard</p>
                      <h3 className="text-lg font-semibold">Diabetic lunch</h3>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      <Zap className="h-3 w-3" />
                      On target
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {[
                      "Scan restaurant menu",
                      "Score carbs & sugar",
                      "Swap high-GI items",
                      "Place Swiggy order",
                    ].map((item, index) => (
                      <div
                        key={item}
                        className="flex items-center justify-between rounded-2xl border border-border/60 bg-background/60 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <Cpu className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{item}</p>
                            <p className="text-xs text-muted-foreground">
                              Step {index + 1}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-emerald-500 font-semibold">
                          ✓
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-2xl border border-border/60 bg-background/60 px-4 py-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Carb load</span>
                      <span>92g → 41g</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 w-2/5 rounded-full bg-gradient-to-r from-primary via-emerald-400 to-amber-400" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="channels" className="relative py-16 sm:py-24 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none z-0">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[560px] h-[560px] rounded-full bg-emerald-400/10 blur-[150px]" />
          </div>
          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                Where you&apos;ll use it
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Start on WhatsApp today. App is on the way.
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                AgentLoop meets you where you already are—no install needed to
                begin. The native app arrives with device sync and dashboards.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {channels.map((channel) => {
                const Icon = channel.icon;
                return (
                  <motion.div
                    key={channel.title}
                    {...fadeUp}
                    className={`rounded-3xl border p-8 ${
                      channel.live
                        ? "border-border/60 bg-card/70"
                        : "border-dashed border-primary/30 bg-primary/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-6 w-6" />
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          channel.live
                            ? "bg-primary/10 text-primary"
                            : "bg-amber-400/15 text-amber-500"
                        }`}
                      >
                        {channel.status}
                      </span>
                    </div>
                    <h3 className="mt-5 text-xl font-semibold">{channel.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {channel.description}
                    </p>
                  </motion.div>
                );
              })}
            </div>

            <motion.div {...fadeUp} className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button className="rounded-full px-8 h-12 text-base font-semibold">
                Get WhatsApp early access
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <a
                href="mailto:janarthanans.in@gmail.com?subject=AgentLoop%20early%20access"
                className="text-sm font-medium text-primary hover:underline cursor-pointer"
              >
                or email janarthanans.in@gmail.com
              </a>
            </motion.div>
          </div>
        </section>

        <section id="use-cases" className="py-16 sm:py-24 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                  Use cases
                </p>
                <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                  One OS, every health journey
                </h2>
                <p className="mt-4 text-muted-foreground max-w-2xl">
                  From diabetes to eldercare, AgentLoop turns Swiggy, Instamart,
                  and Dineout into a health-first commerce layer for every
                  condition and goal.
                </p>
              </div>
              <Button className="rounded-full px-6 w-full sm:w-auto shrink-0">See all use cases</Button>
            </motion.div>

            <div className="mt-12 grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
              {useCases.map((name) => (
                <motion.div
                  key={name}
                  {...fadeUp}
                  className="rounded-2xl border border-border/60 bg-background/70 px-4 py-5 text-center text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all cursor-pointer"
                >
                  {name}
                </motion.div>
              ))}
            </div>

            <div className="mt-12 grid gap-6 grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
              <motion.div {...fadeUp} className="gradient-border rounded-3xl">
                <div className="rounded-3xl bg-card/90 p-8">
                  <h3 className="text-2xl font-semibold">Powered by Swiggy MCP</h3>
                  <p className="mt-3 text-sm text-muted-foreground">
                    AgentLoop runs on Swiggy&apos;s Model Context Protocol—three
                    servers, 34 tools, real transactions. We add the health
                    intelligence on top.
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      { icon: Utensils, label: "Food ordering" },
                      { icon: ShoppingCart, label: "Instamart grocery" },
                      { icon: Salad, label: "Dineout booking" },
                      { icon: ShieldCheck, label: "OAuth 2.1 + PKCE" },
                    ].map((item) => {
                      const Icon = item.icon;
                      return (
                        <div
                          key={item.label}
                          className="flex items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-3"
                        >
                          <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <Icon className="h-4 w-4" />
                          </div>
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>

              <motion.div {...fadeUp} className="rounded-3xl border border-border/60 bg-background/80 p-8">
                <h3 className="text-xl font-semibold">Built for India&apos;s health crisis</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  101M diabetics, 136M prediabetic. AgentLoop scales beyond the
                  consumer to the people who pay for better outcomes.
                </p>
                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  {[
                    "Insurers & employers — measurably healthier members",
                    "Clinics & dieticians — extend care between visits",
                    "Vernacular & voice — reach beyond metro app-users",
                    "Delegated auth — manage a parent's orders remotely",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="mt-6 rounded-full px-6">
                  Partner with us
                </Button>
              </motion.div>
            </div>
          </div>
        </section>

        <section id="pricing" className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                Pricing
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Start free, upgrade when it sticks
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Try the guardrail free. Go Plus for daily management, or partner
                with us to deploy across a whole population.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {pricing.map((plan) => (
                <motion.div
                  key={plan.name}
                  {...fadeUp}
                  className={`rounded-3xl border ${
                    plan.featured
                      ? "border-primary/40 bg-primary/5 shadow-xl shadow-primary/10"
                      : "border-border/60 bg-card/70"
                  } p-8 flex flex-col`}
                >
                  <div>
                    <h3 className="text-xl font-semibold">{plan.name}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>
                    <div className="mt-6 text-3xl font-semibold">
                      {plan.price}
                      {plan.price.startsWith("₹") && plan.price.length > 2 && (
                        <span className="text-sm text-muted-foreground">/mo</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 space-y-2 text-sm text-muted-foreground">
                    {plan.highlights.map((item) => (
                      <div key={item} className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-primary" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <Button
                    className={`mt-8 rounded-full ${
                      plan.featured ? "bg-primary text-primary-foreground" : ""
                    }`}
                    variant={plan.featured ? "default" : "outline"}
                  >
                    {plan.featured ? "Start Plus" : "Get Started"}
                  </Button>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="py-16 sm:py-24 bg-secondary/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="text-center">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                FAQ
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Common questions
              </h2>
            </motion.div>
            <div className="mt-12 grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {faqs.map((faq) => (
                <motion.div
                  key={faq.q}
                  {...fadeUp}
                  className="rounded-3xl border border-border/60 bg-background/80 p-6 cursor-default"
                >
                  <h3 className="text-lg font-semibold">{faq.q}</h3>
                  <p className="mt-3 text-sm text-muted-foreground">{faq.a}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <motion.div
              {...fadeUp}
              className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-background to-amber-200/30 p-12 text-center"
            >
              <div className="absolute -top-20 right-0 h-56 w-56 rounded-full bg-primary/20 blur-[80px] z-0 pointer-events-none" />
              <div className="relative">
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                  Ready to eat on target?
                </p>
                <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                  Put your health goals on autopilot
                </h2>
                <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                  Join India&apos;s first agentic health commerce OS. Set a goal,
                  and let AgentLoop turn Swiggy, Instamart, and Dineout into food
                  that works for you.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button className="rounded-full px-8 h-12 text-base font-semibold">
                    Join the pilot
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="rounded-full px-8 h-12">
                    Partner with us
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 font-semibold text-lg">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <HeartPulse className="h-4 w-4" />
              </span>
              AgentLoop
            </div>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              India&apos;s health commerce OS — every order, on target.
            </p>
            <a
              href="mailto:janarthanans.in@gmail.com"
              className="mt-3 inline-block text-sm font-medium text-primary hover:underline cursor-pointer"
            >
              janarthanans.in@gmail.com
            </a>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground cursor-pointer">Features</a>
            <a href="#how" className="hover:text-foreground cursor-pointer">How it works</a>
            <a href="#use-cases" className="hover:text-foreground cursor-pointer">Use cases</a>
            <a href="#channels" className="hover:text-foreground cursor-pointer">Channels</a>
            <a href="#pricing" className="hover:text-foreground cursor-pointer">Pricing</a>
            <a href="#faq" className="hover:text-foreground cursor-pointer">FAQ</a>
            <a href="mailto:janarthanans.in@gmail.com" className="hover:text-foreground cursor-pointer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
