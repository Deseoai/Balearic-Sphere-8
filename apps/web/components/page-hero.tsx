"use client";

import { motion } from "framer-motion";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  imageUrl: string;
  chips?: string[];
};

export function PageHero({ eyebrow, title, description, imageUrl, chips = [] }: PageHeroProps) {
  return (
    <section
      className="hero-image-band panel-card-strong rounded-[1.7rem] px-5 py-6 sm:px-7 sm:py-8"
      style={{
        backgroundImage: `url("${imageUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }}
    >
      <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-xs uppercase tracking-[0.28em] text-[#d5deef]">
        {eyebrow}
      </motion.p>
      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="mt-2 max-w-3xl font-[var(--font-display)] text-3xl text-white sm:text-5xl"
      >
        {title}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="mt-3 max-w-3xl text-sm text-[#f0f4fb] sm:text-base"
      >
        {description}
      </motion.p>
      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {chips.map((chip, index) => (
            <motion.span
              key={chip}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.16 + index * 0.04 }}
              whileHover={{ y: -2, scale: 1.02 }}
              className="rounded-full border border-white/35 bg-white/15 px-3 py-1 text-xs uppercase tracking-[0.12em] text-white"
            >
              {chip}
            </motion.span>
          ))}
        </div>
      )}
    </section>
  );
}
