"use client";

import { motion } from "framer-motion";
import { useMemo, useState } from "react";

type BenefitItem = {
  id: string;
  title: string;
  value: string;
  description: string;
};

type PageBenefitsProps = {
  eyebrow: string;
  title: string;
  intro: string;
  items: BenefitItem[];
};

export function PageBenefits({ eyebrow, title, intro, items }: PageBenefitsProps) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const active = useMemo(() => items.find((item) => item.id === activeId) ?? items[0], [activeId, items]);

  if (!active) return null;

  return (
    <section className="panel-card rounded-[1.4rem] p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-gold">{eyebrow}</p>
      <h2 className="mt-1 font-[var(--font-display)] text-3xl text-ink">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">{intro}</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {items.map((item) => {
          const selected = item.id === active.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveId(item.id)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selected ? "border-accent/45 bg-accent/10" : "border-[#6c543e2f] bg-white/70 hover:border-accent/30"
              }`}
            >
              <p className="text-sm font-semibold text-ink">{item.title}</p>
              <p className="mt-1 text-xs text-muted">{item.value}</p>
            </button>
          );
        })}
      </div>

      <motion.div
        key={active.id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 rounded-xl border border-accent/20 bg-accent/10 p-3 text-sm text-[#255f5a]"
      >
        <p className="font-semibold text-ink">{active.title}</p>
        <p className="mt-1">{active.description}</p>
      </motion.div>
    </section>
  );
}
