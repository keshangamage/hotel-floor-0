import { Changing } from "@/components/horror/Changing";
import type { PaintingSpec } from "@/game/types";

import { Painting } from "./Painting";

/**
 * The corridor's pictures.
 *
 * Kept apart from Painting itself so the two do not import each other: a
 * changing picture is a painting, and this is the only place that needs to
 * know both exist.
 */
export function Paintings({
  paintings,
  turning,
}: {
  paintings: readonly PaintingSpec[];
  /** Index of the one that changes when nobody is watching it, if any. */
  turning?: number;
}) {
  return (
    <>
      {paintings.map((spec, i) =>
        i === turning ? (
          <Changing key={spec.id} spec={spec} />
        ) : (
          <Painting key={spec.id} spec={spec} />
        ),
      )}
    </>
  );
}
