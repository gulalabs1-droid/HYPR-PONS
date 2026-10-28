import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return [
    { url: `${base}/`, changeFrequency: "always", priority: 1 },
    { url: `${base}/discover`, changeFrequency: "always", priority: 0.9 },
    { url: `${base}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/protocol`, changeFrequency: "hourly", priority: 0.6 },
  ];
}
