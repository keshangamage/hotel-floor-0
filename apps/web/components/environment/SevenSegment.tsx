import { useMemo } from "react";
import * as THREE from "three";

import { UNIT_BOX } from "./resources";

/**
 * A seven-segment readout built from geometry. An elevator display is exactly
 * this shape in reality, and it avoids shipping a font just to draw one digit.
 */
const SEGMENTS = {
  a: { position: [0, 0.5, 0], size: [1, 0.13, 1] },
  g: { position: [0, 0, 0], size: [1, 0.13, 1] },
  d: { position: [0, -0.5, 0], size: [1, 0.13, 1] },
  f: { position: [-0.5, 0.25, 0], size: [0.13, 0.5, 1] },
  b: { position: [0.5, 0.25, 0], size: [0.13, 0.5, 1] },
  e: { position: [-0.5, -0.25, 0], size: [0.13, 0.5, 1] },
  c: { position: [0.5, -0.25, 0], size: [0.13, 0.5, 1] },
} as const;

type Segment = keyof typeof SEGMENTS;
const ALL = Object.keys(SEGMENTS) as Segment[];

const GLYPHS: Readonly<Record<string, readonly Segment[]>> = {
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "g", "c", "d"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ALL,
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
  " ": [],
};

const DIGIT_HEIGHT = 0.2;
const DIGIT_WIDTH = 0.11;
const DIGIT_GAP = 0.05;

export interface SevenSegmentProps {
  value: string;
  color?: string;
  position?: [number, number, number];
}

export function SevenSegment({ value, color = "#ff8c2a", position }: SevenSegmentProps) {
  const [on, off] = useMemo(() => {
    const lit = new THREE.MeshStandardMaterial({
      color: "#000000",
      emissive: new THREE.Color(color),
      emissiveIntensity: 4,
      roughness: 1,
    });
    // Unlit segments stay faintly visible, like a real LED panel.
    const dark = new THREE.MeshStandardMaterial({
      color: "#0d0c0b",
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.06,
      roughness: 1,
    });
    return [lit, dark] as const;
  }, [color]);

  const glyphs = [...value];
  const span = glyphs.length * DIGIT_WIDTH + (glyphs.length - 1) * DIGIT_GAP;

  return (
    <group position={position}>
      {glyphs.map((glyph, index) => {
        const active = new Set(GLYPHS[glyph] ?? []);
        const x = -span / 2 + DIGIT_WIDTH / 2 + index * (DIGIT_WIDTH + DIGIT_GAP);
        return (
          <group key={index} position={[x, 0, 0]}>
            {ALL.map((segment) => {
              const { position: p, size } = SEGMENTS[segment];
              return (
                <mesh
                  key={segment}
                  geometry={UNIT_BOX}
                  material={active.has(segment) ? on : off}
                  position={[p[0] * DIGIT_WIDTH, p[1] * DIGIT_HEIGHT, 0]}
                  scale={[size[0] * DIGIT_WIDTH, size[1] * DIGIT_HEIGHT, 0.012]}
                />
              );
            })}
          </group>
        );
      })}
    </group>
  );
}
