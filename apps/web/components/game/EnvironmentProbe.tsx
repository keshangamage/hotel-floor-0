import { useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

/**
 * Metals reflect their surroundings, so with no environment they render black.
 * That is why the elevator doors read as a hole at the end of the corridor.
 *
 * A 32px gradient probe gives them something to catch, and unlike a loaded HDRI
 * it costs no download and no CDN. Attached rather than assigned, so the scene
 * is never mutated from render.
 */
export function EnvironmentProbe() {
  const gl = useThree((state) => state.gl);

  const environment = useMemo(() => {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      // Dim and warm overhead, near black below: a lit ceiling over dark carpet.
      // Kept faint so the probe rescues reflections without lifting exposure.
      const t = 1 - y / (size - 1);
      const rgb = [40 * t + 6, 34 * t + 5, 27 * t + 5].map((v) => Math.round(v * 0.45));
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        data[i] = rgb[0]!;
        data[i + 1] = rgb[1]!;
        data[i + 2] = rgb[2]!;
        data[i + 3] = 255;
      }
    }

    const source = new THREE.DataTexture(data, size, size);
    source.mapping = THREE.EquirectangularReflectionMapping;
    source.colorSpace = THREE.SRGBColorSpace;
    source.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromEquirectangular(source);
    pmrem.dispose();
    source.dispose();
    return target.texture;
  }, [gl]);

  useEffect(() => () => environment.dispose(), [environment]);

  return <primitive attach="environment" object={environment} />;
}
