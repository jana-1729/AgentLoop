"use client";

import { motion } from "framer-motion";
import { ArrowRight, Play, Sparkles, GitBranch, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden hero-gradient">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/20 blur-[120px] animate-float" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-amber-400/15 blur-[100px] animate-float-delayed" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-400/10 blur-[150px] animate-pulse-glow" />
      </div>

      <div className="absolute inset-0 bg-[linear-gradient(rgba(15,118,110,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(15,118,110,0.05)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <div className="flex flex-col items-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-8">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Agentic Integration Fabric</span>
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] max-w-4xl"
          >
            Orchestrate your
            <br />
            product&apos;s integrations
            <br />
            with <span className="gradient-text">AgentLoop</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-2xl leading-relaxed"
          >
            Design resilient workflows, connect to the tools your customers
            already use, and monitor every run with precision. AgentLoop gives
            your SaaS a secure, scalable integration layer in days—not months.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-10 flex flex-col sm:flex-row items-center gap-4"
          >
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-8 h-12 text-base font-semibold shadow-xl shadow-primary/30 hover:shadow-primary/50 hover:scale-[1.03] transition-all duration-300 group">
              Launch a Workflow
              <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button
              variant="outline"
              className="rounded-full px-8 h-12 text-base font-semibold border-border hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 group"
            >
              <Play className="mr-2 h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
              See the Studio
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="mt-16 w-full max-w-3xl"
          >
            <div className="gradient-border rounded-2xl overflow-hidden">
              <div className="bg-card/80 backdrop-blur-sm p-6 rounded-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="flex gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-rose-400/80" />
                    <div className="w-3 h-3 rounded-full bg-amber-300/80" />
                    <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                  </div>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">
                    agentloop.flow
                  </span>
                </div>
                <div className="font-mono text-sm space-y-2">
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 }}
                    className="flex items-center gap-3"
                  >
                    <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="text-primary">trigger</span>
                      <span className="text-foreground">(</span>
                      <span className="text-emerald-400">&quot;hubspot.contact.created&quot;</span>
                      <span className="text-foreground">)</span>
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.0 }}
                    className="flex items-center gap-3 pl-6"
                  >
                    <GitBranch className="h-4 w-4 text-sky-400 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="text-primary">.enrich</span>
                      <span className="text-foreground">(</span>
                      <span className="text-emerald-400">&quot;score &gt; 80&quot;</span>
                      <span className="text-foreground">)</span>
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 }}
                    className="flex items-center gap-3 pl-6"
                  >
                    <ArrowLeftRight className="h-4 w-4 text-teal-300 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="text-primary">.sync</span>
                      <span className="text-foreground">(</span>
                      <span className="text-emerald-400">&quot;hubspot → slack&quot;</span>
                      <span className="text-foreground">)</span>
                    </span>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.4 }}
                    className="flex items-center gap-3 pl-6"
                  >
                    <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span className="text-muted-foreground">
                      <span className="text-primary">.deliver</span>
                      <span className="text-foreground">()</span>
                      <span className="text-emerald-400 ml-3">✓ 1.8s</span>
                    </span>
                  </motion.div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-12"
          >
            {[
              { value: "600+", label: "Integrations" },
              { value: "99.99%", label: "Workflow SLA" },
              { value: "80M+", label: "Daily Tasks" },
              { value: "<400ms", label: "Median Latency" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
