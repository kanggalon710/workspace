/**
 * SahabatBadge — tier medallion for the JABNET Sahabat loyalty program.
 *
 * Renders a metallic medal per tier (new -> Ambassador). Bintang untuk tier
 * biasa, berlian untuk "Berlian", mahkota untuk "Ambassador". Warna metalik
 * disamakan dengan LEVEL_CFG di LoyaltyAdminPage biar konsisten.
 *
 * Scalable & crisp at any size (vector). `useId()` gives every instance a unique
 * gradient id so many badges on one page never collide.
 *
 *   <SahabatBadge tier="emas" className="w-8 h-8" />
 */
import { useId, type SVGProps } from "react";

export type SahabatTier =
  | "new"
  | "perunggu"
  | "perak"
  | "emas"
  | "platinum"
  | "berlian"
  | "ambassador";

type Glyph = "star" | "diamond" | "crown";

const TIER: Record<SahabatTier, { light: string; base: string; dark: string; glyph: Glyph }> = {
  new:        { light: "#e2e8f0", base: "#94a3b8", dark: "#64748b", glyph: "star" },
  perunggu:   { light: "#fbbf24", base: "#b45309", dark: "#7c2d12", glyph: "star" },
  perak:      { light: "#f1f5f9", base: "#94a3b8", dark: "#64748b", glyph: "star" },
  emas:       { light: "#fde68a", base: "#f59e0b", dark: "#b45309", glyph: "star" },
  platinum:   { light: "#bfdbfe", base: "#3b82f6", dark: "#1d4ed8", glyph: "star" },
  berlian:    { light: "#e9d5ff", base: "#a855f7", dark: "#7e22ce", glyph: "diamond" },
  ambassador: { light: "#fde68a", base: "#f59e0b", dark: "#a855f7", glyph: "crown" },
};

const STAR_POINTS =
  "24,19 25.88,24.41 31.61,24.53 27.04,27.99 28.70,33.47 24,30.2 19.30,33.47 20.96,27.99 16.39,24.53 22.12,24.41";

interface SahabatBadgeProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  tier: SahabatTier | string;
  /** Show the hanging ribbon behind the medal (nicer at larger sizes). */
  ribbon?: boolean;
}

export function SahabatBadge({ tier, ribbon = false, className = "h-10 w-10", ...props }: SahabatBadgeProps) {
  const uid = useId().replace(/:/g, "");
  const cfg = TIER[(tier as SahabatTier)] ?? TIER.new;
  const gDisc = `sb-${uid}-disc`;
  const gSheen = `sb-${uid}-sheen`;

  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id={gDisc} x1="24" y1="11" x2="24" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor={cfg.light} />
          <stop offset="0.5" stopColor={cfg.base} />
          <stop offset="1" stopColor={cfg.dark} />
        </linearGradient>
        <radialGradient id={gSheen} cx="0.35" cy="0.28" r="0.7">
          <stop stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ribbon (optional) */}
      {ribbon && (
        <g opacity="0.9">
          <path d="M18 6 l6 14 -6 4 -4 -14 z" fill={cfg.dark} />
          <path d="M30 6 l-6 14 6 4 4 -14 z" fill={cfg.base} />
        </g>
      )}

      {/* glow */}
      <circle cx="24" cy="27" r="19" fill={cfg.base} opacity="0.14" />
      {/* disc */}
      <circle cx="24" cy="27" r="16" fill={`url(#${gDisc})`} />
      {/* rims */}
      <circle cx="24" cy="27" r="16" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="24" cy="27" r="12.5" stroke={cfg.dark} strokeOpacity="0.5" strokeWidth="1.2" />

      {/* glyph */}
      {cfg.glyph === "star" && (
        <polygon points={STAR_POINTS} fill="#ffffff" fillOpacity="0.92" />
      )}
      {cfg.glyph === "diamond" && (
        <g>
          <path d="M19 22 H29 L33 26 L24 35 L15 26 Z" fill="#ffffff" fillOpacity="0.92" />
          <g stroke={cfg.dark} strokeOpacity="0.35" strokeWidth="0.9">
            <path d="M15 26 H33" />
            <path d="M19 22 L24 35" />
            <path d="M29 22 L24 35" />
            <path d="M19 22 L15 26" />
            <path d="M29 22 L33 26" />
          </g>
        </g>
      )}
      {cfg.glyph === "crown" && (
        <g fill="#ffffff" fillOpacity="0.92">
          <path d="M15 33 L16.5 21 L21 27.5 L24 18.5 L27 27.5 L31.5 21 L33 33 Z" />
          <rect x="15" y="33" width="18" height="2.6" rx="1" />
          <circle cx="16.5" cy="20" r="1.6" />
          <circle cx="24" cy="17" r="1.6" />
          <circle cx="31.5" cy="20" r="1.6" />
        </g>
      )}

      {/* metallic sheen on top */}
      <circle cx="24" cy="27" r="16" fill={`url(#${gSheen})`} />
    </svg>
  );
}
