import { EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";

/**
 * Ambient occlusion, and a vignette.
 *
 * A previous attempt added six effects at once and moved tone mapping off the
 * renderer into the chain, which changes every pixel in the scene and made
 * everything look wrong. The renderer keeps its own ACES tone mapping here, and
 * this composites a single darkening pass on top of it.
 *
 * Occlusion is the biggest single realism lever: it darkens contacts and
 * corners, which is what makes surfaces feel joined rather than stacked.
 *
 * The vignette is the only thing added since, and deliberately the mildest
 * effect there is: one cheap fullscreen pass that touches no colour except at
 * the corners. It narrows the frame, which is what a corridor lit by a torch
 * should feel like, and it cannot repeat the earlier mistake because it does
 * not go near the tone mapping.
 */
export function Effects() {
  return (
    <EffectComposer
      // The composer's target replaces the canvas buffer, so antialiasing has
      // to be requested here or the scene renders with jagged edges.
      multisampling={4}
    >
      <N8AO
        halfRes
        quality="medium"
        aoRadius={1.0}
        distanceFalloff={0.8}
        // Restrained on purpose: heavy AO reads as dirt rather than shadow.
        intensity={1.7}
        aoSamples={16}
        denoiseSamples={4}
        color="#0b0906"
      />
      {/* Restrained on purpose. Enough to close the corners in, not enough for
          the player to notice a filter is on. */}
      <Vignette offset={0.28} darkness={0.55} eskil={false} />
    </EffectComposer>
  );
}
