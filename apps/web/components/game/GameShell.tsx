"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

import { Announce } from "@/components/ui/Announce";
import { Crosshair } from "@/components/ui/Crosshair";
import { InteractPrompt } from "@/components/ui/InteractPrompt";
import { NoteOverlay } from "@/components/ui/NoteOverlay";
import { Overlay } from "@/components/ui/Overlay";
import { input } from "@/game/systems/input";
import { useGameStore } from "@/store/useGameStore";

/**
 * Client boundary for the game. WebGL cannot be prerendered, and Next only
 * allows ssr:false inside a Client Component, so this wrapper is required.
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
  // The keyboard is global, so it attaches once here rather than per component.
  useEffect(() => input.attach(window), []);

  // After mount, so the server's HTML and the first client render agree.
  useEffect(() => {
    void useGameStore.persist.rehydrate();
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-black">
      {/* Rendered before the canvas so the lock target exists when drei looks. */}
      <Overlay />
      <Crosshair />
      <Announce />
      <InteractPrompt />
      <NoteOverlay />
      <GameCanvas />
    </main>
  );
}
