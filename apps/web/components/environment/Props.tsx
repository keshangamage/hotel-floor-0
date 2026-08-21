import { Suspense } from "react";

import type { FloorLayout } from "@/game/types";

import { Prop } from "./Prop";

export function Props({ layout }: { layout: FloorLayout }) {
  return (
    <Suspense fallback={null}>
      {layout.props.map((spec) => (
        <Prop key={spec.instanceId} spec={spec} />
      ))}
    </Suspense>
  );
}
