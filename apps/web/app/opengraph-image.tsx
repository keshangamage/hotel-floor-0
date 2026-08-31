import { ImageResponse } from "next/og";

export const alt = "Hotel Floor 0";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The card a shared link unfurls into.
 *
 * Drawn rather than shipped as a file: it is type on a dark ground, which
 * costs nothing to generate and cannot go stale against the game's own look.
 */
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#07070a",
          // The corridor's own light, falling from above.
          backgroundImage:
            "radial-gradient(ellipse 70% 55% at 50% 0%, #241d14 0%, #07070a 70%)",
        }}
      >
        <div
          style={{
            fontSize: 74,
            letterSpacing: 26,
            color: "#d8d2c0",
            fontWeight: 300,
            display: "flex",
          }}
        >
          HOTEL FLOOR 0
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 21,
            letterSpacing: 9,
            color: "#6b6255",
            display: "flex",
          }}
        >
          SOMETHING ON THIS FLOOR HAS CHANGED
        </div>
      </div>
    ),
    size,
  );
}
