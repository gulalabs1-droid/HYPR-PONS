/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Only the app's own storage project may receive scoped upload tokens or serve video.
    let storageOrigin = "";
    try { const url = new URL(process.env.SUPABASE_URL || ""); if (url.protocol === "https:" && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) storageOrigin = url.origin; } catch { /* unconfigured local build */ }
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: blob:; media-src 'self' blob: ${storageOrigin}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://rpc.mainnet.chain.robinhood.com https://rpc.testnet.chain.robinhood.com https://*.livekit.cloud wss://*.livekit.cloud ${storageOrigin}; frame-src https://www.youtube-nocookie.com https://player.twitch.tv;` },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
      ],
    }];
  },
};

export default nextConfig;
