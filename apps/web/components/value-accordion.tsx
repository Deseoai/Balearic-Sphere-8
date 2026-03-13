"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const items = [
  {
    id: "credits",
    title: "How do credits work?",
    summary: "Every premium action shows its exact credit cost before you click.",
    details:
      "Buy credits once, then spend only where it creates value for you: AI strategy requests, concierge runs, listing visibility, circle upgrades, and intro unlocks."
  },
  {
    id: "login",
    title: "Do I need to sign in every time?",
    summary: "No. Your secure sign-in link is only needed to start a session.",
    details:
      "After sign-in, your device stays remembered until you log out or your session ends. You can open Workspace later and continue where you left off."
  },
  {
    id: "map",
    title: "What is the opportunity map for?",
    summary: "It turns activity into clear next actions.",
    details:
      "Nodes represent real members and real signals from your own activity. Select a node, review fit, and request an intro only when the opportunity makes sense."
  },
  {
    id: "support",
    title: "Where is support?",
    summary: "Support is available both in-app and by email.",
    details:
      "Use the AI Support panel for immediate guidance and the Contact Support button for direct help from management@balea-sphere8.com."
  }
] as const;

export function ValueAccordion() {
  const [openId, setOpenId] = useState<string>(items[0].id);

  return (
    <section className="panel-card rounded-[1.7rem] p-6">
      <p className="text-xs uppercase tracking-[0.24em] text-gold">Clarity</p>
      <h2 className="mt-2 font-[var(--font-display)] text-4xl text-ink">Everything explained in plain language</h2>
      <p className="mt-2 max-w-3xl text-sm text-muted">
        This section answers the most common questions so members instantly understand how access, credits, map, and support work.
      </p>
      <div className="mt-4 grid gap-2">
        {items.map((item) => {
          const open = openId === item.id;
          return (
            <article key={item.id} className="rounded-2xl border border-[#6c543e2f] bg-white/70">
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setOpenId((current) => (current === item.id ? "" : item.id))}
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="text-xs text-muted">{item.summary}</p>
                </div>
                <span className="soft-pill px-2 py-1 text-xs">{open ? "Hide" : "Open"}</span>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <p className="border-t border-[#6c543e26] px-4 py-3 text-sm text-muted">{item.details}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </article>
          );
        })}
      </div>
    </section>
  );
}
