"use client";

import dynamic from "next/dynamic";

/**
 * Client boundary for the game.
 *
 * The canvas is loaded with `ssr: false` because WebGL cannot be prerendered —
 * and Next.js only permits `ssr: false` inside a Client Component, so this
 * wrapper is load-bearing rather than incidental. `app/page.tsx` stays a Server
 * Component and renders this.
 */
const GameCanvas = dynamic(() => import("./GameCanvas"), {
  ssr: false,
  loading: () => <ShellFallback />,
});

function ShellFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black">
      <p className="font-mono text-[0.7rem] uppercase tracking-[0.4em] text-neutral-600">
        Loading
      </p>
    </div>
  );
}

export function GameShell() {
  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black">
      <GameCanvas />
    </main>
  );
}
