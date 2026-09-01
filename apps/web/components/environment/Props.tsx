import { Suspense } from "react";

import { Creeping } from "@/components/horror/Creeping";
import type { AnomalyKind } from "@/game/systems/anomaly";
import type { FloorLayout } from "@/game/types";

import { Prop } from "./Prop";

/** Props that move when the player is not looking, by the anomaly at work. */
const CREEPS: Partial<Record<AnomalyKind, string>> = {
  "chair-creeps": "chair",
};

export function Props({ layout, wrong }: { layout: FloorLayout; wrong?: AnomalyKind }) {
  const creeping = wrong ? CREEPS[wrong] : undefined;

  return (
    <Suspense fallback={null}>
      {layout.props.map((spec) =>
        spec.id === creeping ? (
          <Creeping key={spec.instanceId} spec={spec} />
        ) : (
          <Prop key={spec.instanceId} spec={spec} />
        ),
      )}
    </Suspense>
  );
}
