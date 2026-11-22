import { ImageResponse } from "next/og";

export const alt = "HYPR — watch live creators free, stay for the community. Robinhood Chain testnet preview.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand tokens from brand.css: page, volt, live, violet, cyan, rose.
const BG = "#08080c", VOLT = "#d3fb5a", LIVE = "#ff3b5c", VIOLET = "#a596ff", CYAN = "#6ee7f9", ROSE = "#ff5c8a";
const MAGIC = `linear-gradient(120deg, ${VOLT}, ${CYAN}, ${VIOLET}, ${ROSE})`;

/** The default share card. It shows the product's shape (player, chat, creator bar) with no invented numbers. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", padding: 6, backgroundImage: MAGIC }}>
        <div style={{ flex: 1, display: "flex", padding: "56px 60px", gap: 48, backgroundColor: BG, backgroundImage: `radial-gradient(circle at 92% 8%, rgba(165,150,255,.28), transparent 42%), radial-gradient(circle at 70% 100%, rgba(211,251,90,.14), transparent 45%)`, color: "#f6f6f8", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 560 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 58, height: 58, borderRadius: 16, background: VOLT, color: BG, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 900 }}>H</div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: 6 }}>HYPR</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 78, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
              <span>Watch live.</span>
              <span>Stay for the</span>
              <span style={{ color: VOLT }}>community.</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 25, color: "#d3d3dc" }}>
              <span>Free to watch · No wallet needed</span>
              <span>Chat with just a nickname</span>
              <span style={{ color: "#a6a6b4", fontSize: 21 }}>Robinhood Chain testnet preview · hypr-pons.vercel.app</span>
            </div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, justifyContent: "center" }}>
            <div style={{ display: "flex", padding: 4, borderRadius: 26, backgroundImage: MAGIC }}>
              <div style={{ flex: 1, height: 270, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 22, borderRadius: 22, backgroundColor: "#111117", backgroundImage: `radial-gradient(circle at 30% 30%, rgba(110,231,249,.22), transparent 55%), radial-gradient(circle at 80% 80%, rgba(255,92,138,.22), transparent 55%)` }}>
                <div style={{ display: "flex" }}><span style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRadius: 999, background: LIVE, color: "#fff", fontSize: 18, fontWeight: 800 }}><span style={{ display: "flex", width: 10, height: 10, borderRadius: 999, background: "#fff" }} />LIVE</span></div>
                <div style={{ display: "flex", alignSelf: "center", alignItems: "center", justifyContent: "center", width: 84, height: 84, borderRadius: 999, background: "rgba(246,246,248,.14)" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="#f6f6f8" /></svg>
                </div>
                <div style={{ display: "flex", height: 6, borderRadius: 3, background: "rgba(255,255,255,.18)" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 20, background: "#17171f", border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ width: 46, height: 46, borderRadius: 999, backgroundImage: MAGIC, display: "flex" }} />
              <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>Your favourite creator</span>
                <span style={{ fontSize: 17, color: "#a6a6b4" }}>A room that stays open between shows</span>
              </div>
              <span style={{ display: "flex", padding: "8px 18px", borderRadius: 999, background: VOLT, color: BG, fontSize: 18, fontWeight: 800 }}>Follow</span>
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
