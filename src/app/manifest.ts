import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HYPR — live creators, lasting communities",
    short_name: "HYPR",
    description: "Watch creators live, follow their rooms and come back for the next show.",
    id: "/",
    start_url: "/discover?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0c0e",
    theme_color: "#0b0c0e",
    categories: ["entertainment", "social"],
    icons: [
      { src: "/icons/hypr-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/hypr-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "Live now", url: "/discover?view=live", icons: [{ src: "/icons/hypr-192.png", sizes: "192x192" }] },
      { name: "Following", url: "/following", icons: [{ src: "/icons/hypr-192.png", sizes: "192x192" }] },
    ],
  };
}
