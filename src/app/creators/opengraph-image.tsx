import { ImageResponse } from "next/og";

export const alt = "HYPR for creators — your show, your room. Testnet preview.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function CreatorsShareImage() {
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", padding: "62px 72px", color: "#f5f6fa", fontFamily: "sans-serif", backgroundColor: "#0b0c10", backgroundImage: "radial-gradient(circle at 85% 26%, rgba(168,147,255,.24), transparent 35%), radial-gradient(circle at 78% 92%, rgba(199,243,107,.13), transparent 40%)" }}>
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, background: "#c7f36b", color: "#171923", fontSize: 34, fontWeight: 900 }}>H</div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 800, letterSpacing: 6 }}>HYPR</div>
          <div style={{ display: "flex", marginLeft: "auto", color: "#cabaf5", fontSize: 20, letterSpacing: 2 }}>FOR CREATORS</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1, letterSpacing: -4, fontWeight: 800 }}>Your show.</div>
          <div style={{ display: "flex", fontSize: 88, lineHeight: 1, letterSpacing: -4, fontWeight: 800, color: "#c7f36b" }}>Your room.</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 28, color: "#c7c9d2" }}>Go live. Invite guests. Keep your community.</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, color: "#b9bdc9", fontSize: 19 }}><span>TESTNET PREVIEW · Watching needs no wallet</span><span>hypr-pons.vercel.app/creators</span></div>
      </div>
    </div>,
    size,
  );
}
