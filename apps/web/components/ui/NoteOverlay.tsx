"use client";

import { useGameStore } from "@/store/useGameStore";

/**
 * A note held up to read.
 *
 * Deliberately not a pause: the corridor is still there behind it, and the
 * player can look away rather than dismiss a modal.
 */
export function NoteOverlay() {
  const note = useGameStore((state) => state.reading);
  if (!note) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/70">
      <article className="max-w-[34rem] bg-[#d8d2c0] px-10 py-9 text-neutral-900 shadow-2xl">
        <h2 className="mb-6 font-mono text-[0.7rem] uppercase tracking-[0.4em] text-neutral-600">
          {note.title}
        </h2>
        <div className="space-y-1 font-mono text-[0.82rem] leading-relaxed">
          {note.lines.map((line, i) => (
            <p key={i} className={line ? "" : "h-3"}>
              {line}
            </p>
          ))}
        </div>
        <p className="mt-8 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-neutral-500">
          E to put it down
        </p>
      </article>
    </div>
  );
}
