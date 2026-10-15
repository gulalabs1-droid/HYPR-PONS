import React, { useId } from "react";
import { roomHue } from "@/lib/room-display";

const GENERIC_LOGOS = new Set(["", "✦", "H", "◐"]);

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function random(seed: number) {
  let state = seed || 1;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function tokenGlyph(logo: string | undefined, symbol: string | undefined) {
  if (logo && !GENERIC_LOGOS.has(logo.trim())) return logo;
  return (symbol || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
}

export function CreatorAvatar({ seed, avatar, name }: { seed: string; avatar?: string; name?: string }) {
  return <span className="creator-avatar" aria-hidden="true"><TokenArt seed={seed} glyph={tokenGlyph(avatar, name)} /></span>;
}

// Deterministic artwork so every coin and wallet has a recognizable identity without uploads.
export function TokenArt({ seed, glyph, className }: { seed: string; glyph?: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const hue = /^0x[0-9a-fA-F]{6}/.test(seed) ? roomHue(seed) : hashSeed(seed) % 360;
  const next = random(hashSeed(seed.toLowerCase()));
  const angle = Math.round(next() * 360);
  const blobs = [0, 1, 2].map((index) => ({
    cx: 15 + next() * 90, cy: 15 + next() * 90, r: 26 + next() * 30,
    hue: (hue + [-50, 70, 150][index] + next() * 30 + 360) % 360,
  }));
  const variant = Math.floor(next() * 4);
  const cx = 30 + next() * 60, cy = 30 + next() * 60;
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`${id}b`} gradientTransform={`rotate(${angle} .5 .5)`}>
          <stop offset="0" stopColor={`hsl(${hue} 88% 58%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 60) % 360} 72% 22%)`} />
        </linearGradient>
        <radialGradient id={`${id}h`} cx=".3" cy=".25" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <filter id={`${id}f`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12" /></filter>
      </defs>
      <rect width="120" height="120" fill={`url(#${id}b)`} />
      <g filter={`url(#${id}f)`} opacity=".85">
        {blobs.map((blob, index) => <circle key={index} cx={blob.cx} cy={blob.cy} r={blob.r} fill={`hsl(${blob.hue} 92% 62%)`} />)}
      </g>
      <g fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.2">
        {variant === 0 && [14, 26, 38, 50].map((radius) => <circle key={radius} cx={cx} cy={cy} r={radius} />)}
        {variant === 1 && Array.from({ length: 25 }, (_, index) => <circle key={index} cx={16 + (index % 5) * 22} cy={16 + Math.floor(index / 5) * 22} r="1.6" fill="#fff" fillOpacity=".35" stroke="none" />)}
        {variant === 2 && [0, 1, 2, 3, 4, 5].map((index) => <path key={index} d={`M${-20 + index * 28} 140 L${40 + index * 28} -20`} strokeWidth="7" strokeOpacity=".09" />)}
        {variant === 3 && <path d={`M-10 ${cy + 20} Q ${cx} ${cy - 50} 130 ${cy + 10}`} strokeWidth="2" strokeOpacity=".3" />}
      </g>
      <rect width="120" height="120" fill={`url(#${id}h)`} />
      {glyph && [0, 1].map((layer) => <text key={layer} x="60" y={layer ? 61 : 63.5} textAnchor="middle" dominantBaseline="central" fill={layer ? "#fff" : "#000"} fillOpacity={layer ? 1 : .22} fontSize={glyph.length > 1 && /[a-z0-9]/i.test(glyph) ? 40 : 54} fontWeight="800" style={{ fontFamily: "var(--sans)" }}>{glyph}</text>)}
    </svg>
  );
}
