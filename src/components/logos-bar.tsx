"use client";

import { motion } from "framer-motion";

const logos = [
  "Salesforce",
  "HubSpot",
  "Stripe",
  "BigQuery",
  "Slack",
  "Databricks",
  "Snowflake",
  "Jira",
  "GitHub",
  "Zendesk",
  "Intercom",
  "Notion",
  "Airtable",
  "Twilio",
  "SendGrid",
  "Segment",
];

function LogoItem({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center px-8 py-3 opacity-40 hover:opacity-100 transition-opacity duration-300 shrink-0">
      <span className="text-lg font-semibold tracking-tight text-muted-foreground whitespace-nowrap">
        {name}
      </span>
    </div>
  );
}

export default function LogosBar() {
  return (
    <section className="relative py-16 border-y border-border overflow-hidden">
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="text-center mb-8"
      >
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">
          Integrations your customers already trust
        </p>
      </motion.div>

      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

        <div className="flex animate-marquee">
          {[...logos, ...logos].map((logo, i) => (
            <LogoItem key={`${logo}-${i}`} name={logo} />
          ))}
        </div>
      </div>
    </section>
  );
}
