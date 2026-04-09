import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(120deg, #111827, #0f172a)",
          color: "#e5e7eb",
          padding: "64px 72px",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 38,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#f59e0b",
          }}
        >
          Superfunctions
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 88, fontWeight: 700, color: "#f9fafb" }}>HostFn Docs</div>
          <div style={{ fontSize: 34, color: "#d1d5db" }}>
            Deployment and server management utilities
          </div>
        </div>
      </div>
    ),
    size,
  );
}
