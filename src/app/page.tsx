"use client";

import { motion } from "framer-motion";
import {
  ArrowRight,
  Orbit,
  ShieldCheck,
  Workflow,
  Radar,
  Boxes,
  Sparkles,
  Plug,
  LineChart,
  Cpu,
  Globe,
  Zap,
  ChevronRight,
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
    title: "Agentic Canvas",
    description:
      "Design workflows with AI-native blocks, loops, and conditionals without losing visibility.",
    icon: Workflow,
  },
  {
    title: "Integration Registry",
    description:
      "Pre-built connectors plus a schema-first SDK to ship new integrations fast.",
    icon: Plug,
  },
  {
    title: "Governed Execution",
    description:
      "Rate limits, retries, approvals, and tenant isolation built into every run.",
    icon: ShieldCheck,
  },
  {
    title: "Real-Time Observability",
    description:
      "Trace every step, inspect payloads, and alert on anomalies before customers do.",
    icon: Radar,
  },
  {
    title: "Versioned Workflows",
    description:
      "Promote changes safely with staging, rollbacks, and environment snapshots.",
    icon: Boxes,
  },
  {
    title: "AI Optimization",
    description:
      "Auto-suggest transformations and enrich data using contextual agents.",
    icon: Sparkles,
  },
];

const steps = [
  {
    title: "Model your integration",
    description:
      "Define triggers, actions, and data contracts with a guided schema builder.",
  },
  {
    title: "Compose the workflow",
    description:
      "Drag, connect, and simulate the flow with test data and live previews.",
  },
  {
    title: "Ship with confidence",
    description:
      "Deploy to production with monitoring, alerts, and environment guardrails.",
  },
];

const integrations = [
  "Salesforce",
  "HubSpot",
  "Stripe",
  "Slack",
  "Zendesk",
  "Snowflake",
  "Databricks",
  "Notion",
  "Airtable",
  "GitHub",
  "Jira",
  "Intercom",
];

const pricing = [
  {
    name: "Starter",
    price: "$0",
    description: "For early stage products proving integrations.",
    highlights: [
      "Up to 3 workflows",
      "Community connectors",
      "Shared execution pool",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "$899",
    description: "For teams scaling customer automations.",
    highlights: [
      "Unlimited workflows",
      "Premium connectors",
      "Dedicated runtime",
      "SLAs + onboarding",
    ],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "Let’s talk",
    description: "For regulated teams and complex ecosystems.",
    highlights: [
      "Private cloud",
      "Custom SLAs",
      "Advanced governance",
      "Security reviews",
    ],
  },
];

const faqs = [
  {
    q: "How is AgentLoop different from Zapier?",
    a: "AgentLoop is embedded inside your product, with governance and observability that match enterprise-grade expectations.",
  },
  {
    q: "Can we build our own connectors?",
    a: "Yes. Use our SDK to create schema-first connectors and publish them to your private registry.",
  },
  {
    q: "Does it support multi-tenant isolation?",
    a: "Every workflow run is isolated with tenant-aware policies, rate limits, and audit trails.",
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
                Everything you need to ship reliable integrations
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                AgentLoop combines a workflow studio, integration registry, and
                control plane so your team can launch faster without sacrificing
                safety.
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

        <section id="studio" className="py-16 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 grid gap-10 sm:gap-12 lg:grid-cols-[1.1fr_0.9fr] items-center">
            <motion.div {...fadeUp}>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                AgentLoop Studio
              </p>
              <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                Build agentic workflows with clarity
              </h2>
              <p className="mt-4 text-muted-foreground">
                Visualize every step, preview transformations, and ship to
                production with guarded releases. AgentLoop keeps your workflows
                expressive and safe.
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
                  Explore the Studio
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="rounded-full px-6">
                  Download a sample flow
                </Button>
              </div>
            </motion.div>

            <motion.div {...fadeUp} className="relative">
              <div className="absolute -top-10 -right-8 h-40 w-40 rounded-full bg-amber-300/20 blur-[80px] z-0 pointer-events-none" />
              <div className="gradient-border rounded-3xl">
                <div className="rounded-3xl bg-card/90 p-6 backdrop-blur-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Live workflow</p>
                      <h3 className="text-lg font-semibold">Customer onboarding</h3>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      <Zap className="h-3 w-3" />
                      Running
                    </div>
                  </div>
                  <div className="mt-6 space-y-4">
                    {["Enrich lead", "Score intent", "Notify CSM", "Create deal"].map(
                      (item, index) => (
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
                            ✓ 120ms
                          </span>
                        </div>
                      )
                    )}
                  </div>
                  <div className="mt-6 rounded-2xl border border-border/60 bg-background/60 px-4 py-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Median latency</span>
                      <span>0.38s</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 w-3/4 rounded-full bg-gradient-to-r from-primary via-emerald-400 to-amber-400" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <section id="integrations" className="py-16 sm:py-24 bg-secondary/40">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div {...fadeUp} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.3em] text-muted-foreground">
                  Integrations
                </p>
                <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                  Connect anything, publish once
                </h2>
                <p className="mt-4 text-muted-foreground max-w-2xl">
                  AgentLoop ships with curated connectors and a registry to host
                  your own. Keep everything discoverable for your customers.
                </p>
              </div>
              <Button className="rounded-full px-6 w-full sm:w-auto shrink-0">Browse integration hub</Button>
            </motion.div>

            <div className="mt-12 grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
              {integrations.map((name) => (
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
                  <h3 className="text-2xl font-semibold">Integration builder</h3>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Define auth, schemas, and actions with a guided SDK. Ship a
                    connector in hours with staged deployments.
                  </p>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {[
                      { icon: Globe, label: "OAuth + API keys" },
                      { icon: LineChart, label: "Usage analytics" },
                      { icon: Orbit, label: "Versioning" },
                      { icon: ShieldCheck, label: "Security reviews" },
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
                <h3 className="text-xl font-semibold">Enterprise-ready by default</h3>
                <p className="mt-3 text-sm text-muted-foreground">
                  Bring compliance, observability, and governance to every
                  workflow your customers trigger.
                </p>
                <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                  {[
                    "Tenant isolation and per-workspace limits",
                    "Audit trails with retention controls",
                    "PII redaction and vault-backed secrets",
                    "SOC 2-ready security workflows",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <Button variant="outline" className="mt-6 rounded-full px-6">
                  Talk to security
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
                Choose the scale you need
              </h2>
              <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                Start fast, then grow into advanced observability and governance.
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
                      {plan.price.startsWith("$") && (
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
                    {plan.featured ? "Start Growth" : "Get Started"}
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
                Answers for builders
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
                  Ready to launch?
                </p>
                <h2 className="mt-4 text-3xl sm:text-4xl font-semibold">
                  Build your integration layer in weeks
                </h2>
                <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
                  Bring workflows, data mapping, and observability into one
                  platform. AgentLoop gives your team the leverage to scale.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button className="rounded-full px-8 h-12 text-base font-semibold">
                    Request a demo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                  <Button variant="outline" className="rounded-full px-8 h-12">
                    View docs
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
                <Sparkles className="h-4 w-4" />
              </span>
              AgentLoop
            </div>
            <p className="mt-2 text-sm text-muted-foreground max-w-md">
              The agentic integration fabric for modern SaaS teams.
            </p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground cursor-pointer">Features</a>
            <a href="#integrations" className="hover:text-foreground cursor-pointer">Integrations</a>
            <a href="#pricing" className="hover:text-foreground cursor-pointer">Pricing</a>
            <a href="#faq" className="hover:text-foreground cursor-pointer">FAQ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
