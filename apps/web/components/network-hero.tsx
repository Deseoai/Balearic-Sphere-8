"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const nodes = [
  { label: "Investors Circle", x: 10, y: 18, tier: "high" },
  { label: "Hospitality Operators", x: 79, y: 16, tier: "high" },
  { label: "Yachting & Luxury", x: 87, y: 48, tier: "medium" },
  { label: "Off-Market Deals", x: 20, y: 74, tier: "high" },
  { label: "Founders Mallorca", x: 66, y: 78, tier: "medium" },
  { label: "Strategic Services", x: 40, y: 10, tier: "open" }
] as const;

function ringColor(tier: (typeof nodes)[number]["tier"]): string {
  if (tier === "high") return "rgba(201,106,60,0.35)";
  if (tier === "medium") return "rgba(45,142,117,0.3)";
  return "rgba(103,112,70,0.28)";
}

export function NetworkHero() {
  return (
    <section className="panel-card-strong relative overflow-hidden rounded-[2rem] px-6 py-10 sm:px-9 sm:py-12 lg:px-12">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(115deg, rgba(19,18,21,0.78), rgba(19,18,21,0.46)), url('https://images.pexels.com/photos/338504/pexels-photo-338504.jpeg?auto=compress&cs=tinysrgb&w=1800')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />
      <div className="grid-overlay absolute inset-0 opacity-35" />
      <div className="relative z-10 grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div className="space-y-5">
          <p className="text-xs uppercase tracking-[0.35em] text-[#f1d39f]">Private. Curated. Elite signal.</p>
          <h1 className="font-[var(--font-display)] text-3xl leading-tight text-[#fff8ec] sm:text-5xl">
            The private business network for people building real momentum in the Balearics.
          </h1>
          <p className="max-w-xl text-base text-[#f6e8d1] sm:text-lg">
            Access is earned through relevance, trust, and contribution. Meet the right partner, investor, or opportunity
            based on fit, not noise.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/request-access"
              className="sun-button rounded-full px-6 py-3 text-sm font-semibold transition hover:-translate-y-[1px]"
            >
              Apply for Access
            </Link>
            <Link
              href="/workspace"
              className="accent-button rounded-full px-6 py-3 text-sm font-semibold transition hover:-translate-y-[1px]"
            >
              Open Workspace
            </Link>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <span className="soft-pill bg-white/90 px-3 py-1 text-xs uppercase tracking-[0.15em]">AI Concierge</span>
            <span className="soft-pill bg-white/90 px-3 py-1 text-xs uppercase tracking-[0.15em]">Human Review</span>
            <span className="soft-pill bg-white/90 px-3 py-1 text-xs uppercase tracking-[0.15em]">Credits and Access</span>
          </div>
        </div>

        <div className="panel-card relative mx-auto h-[300px] w-full max-w-[480px] overflow-hidden rounded-[1.6rem] sm:h-[370px]">
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-transparent" />

          <div className="absolute left-1/2 top-1/2 h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-olive/25" />
          <div className="absolute left-1/2 top-1/2 h-26 w-26 -translate-x-1/2 -translate-y-1/2 rounded-full border border-sun/30" />
          <div className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/35 bg-accent/10" />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sun" />
          <span className="absolute left-1/2 top-1/2 mt-10 -translate-x-1/2 text-[11px] uppercase tracking-[0.16em] text-muted">
            You
          </span>

          {nodes.map((node, index) => (
            <motion.div
              key={node.label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.22 + index * 0.1, duration: 0.45 }}
              className="absolute"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: ringColor(node.tier), boxShadow: `0 0 0 7px ${ringColor(node.tier)}` }}
              />
              <div className="mt-2 hidden -translate-x-1/2 whitespace-nowrap rounded-full border border-[#6c543e3a] bg-[#fff8ecdd] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#6b5645] sm:block">
                {node.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
