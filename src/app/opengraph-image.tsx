import { ImageResponse } from "next/og";

export const alt = "HYPR — find the rooms where it’s moving";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, backgroundColor: "#0b0c0e", backgroundImage: "radial-gradient(circle at 85% 20%, rgba(199,243,107,0.18), transparent 45%)", color: "#f1f2f4", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, border: "3px solid #c7f36b", color: "#c7f36b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 800 }}>H</div>
          <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 8 }}>HYPR</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 96, fontWeight: 800, lineHeight: 1, letterSpacing: -4 }}>
          <span>Find the rooms</span>
          <span style={{ color: "#c7f36b" }}>where it’s moving.</span>
        </div>
        <div style={{ fontSize: 28, color: "#858a95" }}>The live launchpad for Robinhood Chain communities</div>
      </div>
    ),
    size,
  );
}
