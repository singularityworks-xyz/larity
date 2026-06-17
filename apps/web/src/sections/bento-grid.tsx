// biome-ignore lint/suspicious/noArrayIndexKey: decorative elements
import React from "react";

// Deterministic pseudo-random for hydration-safe algorithmic art
const prng = (seed: number) => {
  let s = seed;
  const x = Math.sin(s++) * 10_000;
  return x - Math.floor(x);
};

// 1. Pre-Meeting Brief: Structured data nodes connecting
const NetworkArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full text-zinc-300 opacity-60 mix-blend-multiply transition-transform duration-700 group-hover:scale-105"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 30 }).map((_, i) => {
      const x = prng(i * 1.1) * 100;
      const y = prng(i * 2.2) * 100;
      return (
        <React.Fragment key={`net-${i}`}>
          <circle cx={x} cy={y} fill="currentColor" r={prng(i) * 1.5 + 0.5} />
          {i % 2 === 0 && (
            <line
              opacity="0.5"
              stroke="currentColor"
              strokeWidth="0.2"
              x1={x}
              x2={prng(i * 3.3) * 100}
              y1={y}
              y2={prng(i * 4.4) * 100}
            />
          )}
        </React.Fragment>
      );
    })}
  </svg>
);

// 2. Silent Co-Pilot: Ambient background listening waves
const WavesArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full text-accent opacity-20 transition-transform duration-1000 group-hover:scale-110"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 15 }).map((_, i) => (
      <path
        d={`M0 ${50 + prng(i) * 40 - 20} Q 25 ${30 + i * 5}, 50 ${50 + prng(i * 2) * 20} T 100 ${50 - prng(i * 3) * 30}`}
        fill="none"
        key={`wave-${i}`}
        opacity={0.2 + prng(i * 5) * 0.5}
        stroke="currentColor"
        strokeWidth={prng(i) * 0.8 + 0.2}
      />
    ))}
  </svg>
);

// 3. Contradiction Detection: Sharp red intersection / rupture
const FractureArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full opacity-30 transition-transform duration-500 group-hover:scale-105"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 20 }).map((_, i) => {
      const isRed = prng(i) > 0.8;
      return (
        <line
          className={isRed ? "text-clay" : "text-zinc-300"}
          key={`frac-${i}`}
          stroke={isRed ? "#B0472A" : "currentColor"}
          strokeWidth={isRed ? "1" : "0.2"}
          transform={`rotate(${prng(i * 2) * 20 - 10} 50 50)`}
          x1={prng(i * 1.2) * 100}
          x2={prng(i * 1.5) * 100}
          y1={0}
          y2={100}
        />
      );
    })}
    <path
      d="M20 80 L50 40 L80 90"
      fill="none"
      opacity="0.8"
      stroke="#B0472A"
      strokeWidth="1.5"
    />
  </svg>
);

// 4. Organisational Memory: Deep concentric data layers
const RingsArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full text-zinc-300 opacity-40 transition-transform duration-1000 group-hover:scale-110"
    preserveAspectRatio="xMidYMid slice"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 12 }).map((_, i) => (
      <circle
        cx="50"
        cy="50"
        fill="none"
        key={`ring-${i}`}
        r={i * 6 + prng(i) * 2}
        stroke="currentColor"
        strokeDasharray={`${prng(i * 2) * 10 + 5} ${prng(i * 3) * 5 + 2}`}
        strokeWidth="0.3"
        transform={`rotate(${i * 15} 50 50)`}
      />
    ))}
  </svg>
);

// 5. Post-Meeting Brief: Structured blocks falling into place
const BlocksArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full text-zinc-300 opacity-50 transition-transform duration-700 group-hover:-translate-y-2 group-hover:scale-105"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 25 }).map((_, i) => {
      const width = prng(i) * 20 + 5;
      const height = prng(i * 2) * 15 + 2;
      return (
        <rect
          fill="none"
          height={height}
          key={`block-${i}`}
          opacity={prng(i * 5) * 0.8 + 0.2}
          stroke="currentColor"
          strokeWidth="0.3"
          width={width}
          x={prng(i * 3) * 100}
          y={prng(i * 4) * 100}
        />
      );
    })}
  </svg>
);

// 6. Policy Guardrails: Diagonal warning track / strict borders
const GuardrailsArt = () => (
  <svg
    aria-hidden="true"
    className="absolute inset-0 h-full w-full text-accent opacity-20 transition-transform duration-700 group-hover:scale-105"
    preserveAspectRatio="none"
    viewBox="0 0 100 100"
  >
    {Array.from({ length: 40 }).map((_, i) => (
      <line
        key={`rail-${i}`}
        opacity={i % 5 === 0 ? "0.8" : "0.3"}
        stroke="currentColor"
        strokeWidth="1"
        x1={-50 + i * 5}
        x2={50 + i * 5}
        y1={150}
        y2={-50}
      />
    ))}
  </svg>
);

export function BentoGrid() {
  return (
    <section className="w-full bg-bg py-32" id="features">
      <div className="mx-auto max-w-6xl px-6 md:px-8">
        {/* Editorial Section Header */}
        <div className="mb-20 text-center">
          <span className="mb-4 block font-mono text-accent text-xs uppercase tracking-[0.2em]">
            Core Capabilities
          </span>
          <h2 className="font-display text-5xl text-zinc-900 tracking-tight sm:text-6xl">
            Built for Technical Detail.
          </h2>
        </div>

        {/* Algorithmic Bento Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-3 lg:gap-6">
          {/* Card 1 (Wide) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl bg-white p-8 md:col-span-2">
            <NetworkArt />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur-md">
              <h3 className="font-display text-3xl text-zinc-900">
                Pre-Meeting Brief
              </h3>
              <p className="mt-3 font-light text-base text-zinc-600 leading-relaxed">
                Larity scans your calendar and prior sessions to deliver a
                prioritised briefing of context, open questions, and known risks
                before your meeting starts.
              </p>
            </div>
          </div>

          {/* Card 2 (Tall) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl bg-zinc-900 p-8 md:row-span-2">
            <WavesArt />
            <div className="relative z-10 w-full rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md">
              <h3 className="font-display text-3xl text-white">
                Silent Co-Pilot
              </h3>
              <p className="mt-3 font-light text-base text-zinc-400 leading-relaxed">
                Operating silently at the OS level, Larity catches
                contradictions, scope creep, and pressure tactics live on the
                call without disruptive bots.
              </p>
            </div>
          </div>

          {/* Card 3 (Square) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl border border-zinc-200 bg-[#fdfaf5] p-8">
            <FractureArt />
            <div className="relative z-10 w-full rounded-2xl border border-[#B0472A]/10 bg-white/70 p-4 backdrop-blur-md">
              <h3 className="font-display text-2xl text-zinc-900">
                Contradiction Detection
              </h3>
              <p className="mt-2 font-light text-sm text-zinc-600 leading-relaxed">
                Catches timeline and commitment discrepancies silently in real
                time if someone alters a parameter.
              </p>
            </div>
          </div>

          {/* Card 5 (Square) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl bg-white p-8">
            <BlocksArt />
            <div className="relative z-10 w-full rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur-md">
              <h3 className="font-display text-2xl text-zinc-900">
                Automatic Briefs
              </h3>
              <p className="mt-2 font-light text-sm text-zinc-600 leading-relaxed">
                Extracts structured decisions, tasks, owners, and deadlines
                immediately when your call ends.
              </p>
            </div>
          </div>

          {/* Card 4 (Wide) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl border border-zinc-200/50 bg-zinc-100 p-8 md:col-span-2">
            <RingsArt />
            <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/40 bg-white/60 p-4 backdrop-blur-md">
              <h3 className="font-display text-3xl text-zinc-900">
                Organisational Memory
              </h3>
              <p className="mt-3 font-light text-base text-zinc-600 leading-relaxed">
                Every commitment is stored with full provenance, timestamps, and
                exact quotes, building a permanent, searchable memory.
              </p>
            </div>
          </div>

          {/* Card 6 (Square) */}
          <div className="group relative flex min-h-[300px] flex-col justify-end overflow-hidden rounded-3xl bg-[#2A3423] p-8">
            <GuardrailsArt />
            <div className="relative z-10 w-full rounded-2xl border border-white/10 bg-[#1A2215]/60 p-4 backdrop-blur-md">
              <h3 className="font-display text-2xl text-white">
                Policy Guardrails
              </h3>
              <p className="mt-2 font-light text-sm text-zinc-300 leading-relaxed">
                Define NDA terms or pricing floors. Larity flags violations in
                real time, routed privately to you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
