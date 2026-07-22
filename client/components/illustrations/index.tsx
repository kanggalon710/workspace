/**
 * JABNET brand illustration library
 * ---------------------------------
 * Hand-crafted, theme-aware SVG spot illustrations for empty states, error
 * pages, and hero decoration. Same visual language as `/public/favicon.svg`:
 * fiber/network nodes linked by cables, JABNET brand gradient (sky-400 -> blue-700).
 *
 * Design rules baked in:
 *  - Brand identity colors (sky/blue) are intentional hex — a brand asset, the
 *    one accepted exception to the "no hardcoded hex" component rule.
 *  - Neutral grounding/scaffold uses `currentColor` at low opacity so the art
 *    adapts to light AND dark themes automatically (inherits text color).
 *  - Every <svg> namespaces its gradient/clip IDs (ei-, eu-, ...) so multiple
 *    illustrations can render on the same page without ID collisions.
 *  - All are decorative: `aria-hidden`. The paired title/description carries meaning.
 *
 * Usage:
 *   <EmptyState illustration={<EmptyUsers className="h-36" />} title="..." />
 *   <NotFoundIllustration className="h-44 w-auto mx-auto" />
 */
import type { SVGProps } from "react";

export { SahabatBadge, type SahabatTier } from "./SahabatBadge";

type IllustrationProps = SVGProps<SVGSVGElement>;

const SKY = "#38BDF8";
const BRAND = "#0EA5E9";
const BLUE = "#1D4ED8";

/** Shared soft shadow ellipse under each object — theme-aware via currentColor. */
function Ground(props: SVGProps<SVGEllipseElement>) {
  return <ellipse cx={120} cy={151} rx={74} ry={10} fill="currentColor" opacity={0.06} {...props} />;
}

/* ------------------------------------------------------------------ *
 * 1. Empty / no data — an empty container with a faded signal
 * ------------------------------------------------------------------ */
export function EmptyInbox({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="ei-g" x1="120" y1="52" x2="120" y2="138" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <Ground />
      {/* floating signal above the card */}
      <line x1="104" y1="43" x2="136" y2="43" stroke="url(#ei-g)" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      <circle cx="104" cy="43" r="4" fill="url(#ei-g)" />
      <circle cx="136" cy="43" r="4" fill="url(#ei-g)" opacity="0.4" />
      {/* container card */}
      <rect x="70" y="60" width="100" height="74" rx="16" fill="url(#ei-g)" fillOpacity="0.10" stroke="url(#ei-g)" strokeWidth="2.5" />
      {/* empty dashed slot */}
      <circle cx="120" cy="97" r="21" stroke="url(#ei-g)" strokeWidth="2.5" strokeDasharray="4 6" strokeLinecap="round" opacity="0.75" />
      <circle cx="111" cy="97" r="2.4" fill="url(#ei-g)" />
      <circle cx="120" cy="97" r="2.4" fill="url(#ei-g)" />
      <circle cx="129" cy="97" r="2.4" fill="url(#ei-g)" />
      {/* sparkles */}
      <path d="M58 74 v10 M53 79 h10" stroke="url(#ei-g)" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
      <path d="M186 104 v8 M182 108 h8" stroke="url(#ei-g)" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 2. No users / members — avatar nodes, one an open invite slot
 * ------------------------------------------------------------------ */
export function EmptyUsers({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="eu-g" x1="120" y1="46" x2="120" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <Ground />
      {/* back-left avatar (faded) */}
      <g opacity="0.35">
        <circle cx="84" cy="84" r="12" fill="url(#eu-g)" />
        <path d="M64 122 a20 20 0 0 1 40 0 z" fill="url(#eu-g)" />
      </g>
      {/* back-right avatar (faded) */}
      <g opacity="0.35">
        <circle cx="156" cy="84" r="12" fill="url(#eu-g)" />
        <path d="M136 122 a20 20 0 0 1 40 0 z" fill="url(#eu-g)" />
      </g>
      {/* front centre — open invite slot (dashed) */}
      <circle cx="120" cy="76" r="16" fill="url(#eu-g)" fillOpacity="0.10" stroke="url(#eu-g)" strokeWidth="2.5" strokeDasharray="4 6" />
      <path d="M92 126 a28 28 0 0 1 56 0 z" fill="url(#eu-g)" fillOpacity="0.10" stroke="url(#eu-g)" strokeWidth="2.5" strokeDasharray="4 6" />
      {/* add badge */}
      <circle cx="150" cy="58" r="12" fill="url(#eu-g)" />
      <path d="M150 52 v12 M144 58 h12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 3. No search results — magnifier over a faded node grid
 * ------------------------------------------------------------------ */
export function EmptySearch({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="es-g" x1="110" y1="46" x2="110" y2="150" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <Ground />
      {/* faded node grid */}
      <g fill="url(#es-g)" opacity="0.16">
        <circle cx="150" cy="58" r="4" />
        <circle cx="178" cy="70" r="4" />
        <circle cx="176" cy="104" r="4" />
        <circle cx="150" cy="128" r="4" />
        <circle cx="70" cy="120" r="4" />
      </g>
      {/* magnifier */}
      <circle cx="108" cy="84" r="34" fill="url(#es-g)" fillOpacity="0.08" stroke="url(#es-g)" strokeWidth="6" />
      <line x1="133" y1="109" x2="158" y2="134" stroke="url(#es-g)" strokeWidth="9" strokeLinecap="round" />
      {/* "no match" inside lens */}
      <circle cx="96" cy="84" r="3" fill="url(#es-g)" opacity="0.6" />
      <circle cx="108" cy="84" r="3" fill="url(#es-g)" opacity="0.6" />
      <circle cx="120" cy="84" r="3" fill="url(#es-g)" opacity="0.6" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 4. Error / disconnected — a broken fiber link between two nodes
 * ------------------------------------------------------------------ */
export function EmptyDisconnected({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="ed-g" x1="120" y1="60" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <Ground />
      {/* warning */}
      <path d="M120 46 l13 22 h-26 z" fill="#F59E0B" fillOpacity="0.18" stroke="#F59E0B" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M120 55 v6" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="120" cy="64" r="1.4" fill="#F59E0B" />
      {/* left node + cable */}
      <circle cx="72" cy="98" r="15" fill="url(#ed-g)" />
      <circle cx="72" cy="98" r="6" fill="#fff" fillOpacity="0.85" />
      <path d="M87 98 q18 0 26 -6" stroke="url(#ed-g)" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* break sparks */}
      <path d="M118 88 l6 6 M126 86 l-4 8" stroke="#F59E0B" strokeWidth="2.4" strokeLinecap="round" />
      {/* right node + cable */}
      <circle cx="168" cy="98" r="15" fill="url(#ed-g)" />
      <circle cx="168" cy="98" r="6" fill="#fff" fillOpacity="0.85" />
      <path d="M153 98 q-18 0 -26 6" stroke="url(#ed-g)" strokeWidth="5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 5. Success / all clear — a connected node badge with a check
 * ------------------------------------------------------------------ */
export function EmptySuccess({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="esc-g" x1="120" y1="52" x2="120" y2="126" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <Ground />
      {/* satellite nodes + green links */}
      <g stroke="#22C55E" strokeWidth="2.4" strokeLinecap="round" opacity="0.75">
        <line x1="120" y1="88" x2="66" y2="60" />
        <line x1="120" y1="88" x2="182" y2="66" />
        <line x1="120" y1="88" x2="176" y2="118" />
      </g>
      <circle cx="66" cy="60" r="6" fill="#22C55E" />
      <circle cx="182" cy="66" r="6" fill="#22C55E" />
      <circle cx="176" cy="118" r="6" fill="#22C55E" />
      {/* centre badge */}
      <circle cx="120" cy="88" r="35" fill="url(#esc-g)" />
      <circle cx="120" cy="88" r="35" stroke="#fff" strokeOpacity="0.25" strokeWidth="4" />
      <path d="M104 89 l11 12 22 -26" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 6. No location / map — a dropped pin over a faint grid
 * ------------------------------------------------------------------ */
export function EmptyLocation({ className = "h-40 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 240 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="el-g" x1="120" y1="42" x2="120" y2="132" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
        <clipPath id="el-clip"><rect x="58" y="60" width="124" height="72" rx="12" /></clipPath>
      </defs>
      <Ground />
      {/* faint map grid */}
      <g clipPath="url(#el-clip)" stroke="currentColor" strokeWidth="1.5" opacity="0.12">
        <line x1="58" y1="84" x2="182" y2="84" />
        <line x1="58" y1="108" x2="182" y2="108" />
        <line x1="92" y1="60" x2="92" y2="132" />
        <line x1="130" y1="60" x2="130" y2="132" />
        <line x1="160" y1="60" x2="160" y2="132" />
      </g>
      <rect x="58" y="60" width="124" height="72" rx="12" stroke="url(#el-g)" strokeWidth="2.5" opacity="0.4" />
      {/* radar rings */}
      <ellipse cx="120" cy="122" rx="34" ry="11" stroke="url(#el-g)" strokeWidth="2" strokeDasharray="3 6" opacity="0.5" />
      {/* pin */}
      <path d="M120 46 a26 26 0 0 1 26 26 c0 19 -26 50 -26 50 s-26 -31 -26 -50 a26 26 0 0 1 26 -26 z" fill="url(#el-g)" />
      <circle cx="120" cy="72" r="10" fill="#fff" fillOpacity="0.9" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 7. 404 / not found — an unplugged fiber connector, signal lost
 *    (larger scene for the full-page 404 route)
 * ------------------------------------------------------------------ */
export function NotFoundIllustration({ className = "h-44 w-auto", ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 260 180" fill="none" className={className} role="img" aria-hidden {...props}>
      <defs>
        <linearGradient id="nf-g" x1="130" y1="40" x2="130" y2="140" gradientUnits="userSpaceOnUse">
          <stop stopColor={SKY} />
          <stop offset="0.55" stopColor={BRAND} />
          <stop offset="1" stopColor={BLUE} />
        </linearGradient>
      </defs>
      <ellipse cx={130} cy={152} rx={86} ry={11} fill="currentColor" opacity={0.06} />
      {/* lost signal waves (crossed) */}
      <g stroke="url(#nf-g)" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.55">
        <path d="M150 66 a26 26 0 0 1 22 0" />
        <path d="M144 78 a40 40 0 0 1 34 0" />
      </g>
      <path d="M156 58 l24 24 M180 58 l-24 24" stroke="#F43F5E" strokeWidth="3" strokeLinecap="round" />
      {/* socket (left, on a wall plate) */}
      <rect x="42" y="86" width="46" height="42" rx="10" fill="url(#nf-g)" fillOpacity="0.12" stroke="url(#nf-g)" strokeWidth="3" />
      <rect x="72" y="98" width="18" height="8" rx="4" fill="url(#nf-g)" />
      <rect x="72" y="110" width="18" height="8" rx="4" fill="url(#nf-g)" />
      {/* slack cable dangling */}
      <path d="M90 102 q28 34 44 6" stroke="url(#nf-g)" strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* plug (pulled out, right) */}
      <g>
        <rect x="150" y="96" width="40" height="24" rx="8" fill="url(#nf-g)" />
        <rect x="134" y="102" width="18" height="12" rx="4" fill="url(#nf-g)" />
        <line x1="190" y1="108" x2="206" y2="108" stroke="url(#nf-g)" strokeWidth="5" strokeLinecap="round" />
      </g>
      {/* disconnect spark between socket & plug */}
      <path d="M120 116 l7 7 M130 114 l-5 9" stroke="#F59E0B" strokeWidth="2.6" strokeLinecap="round" />
      {/* stray question dots */}
      <circle cx="214" cy="70" r="3" fill="url(#nf-g)" opacity="0.5" />
      <circle cx="40" cy="66" r="3" fill="url(#nf-g)" opacity="0.4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * 8. Fiber constellation — abstract network for hero/background decor.
 *    No default size: caller controls dimensions + opacity + text color.
 * ------------------------------------------------------------------ */
export function FiberConstellation({ className, ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 320 260" fill="none" className={className} role="img" aria-hidden {...props}>
      {/* links (inherit currentColor so caller tints it) */}
      <g stroke="currentColor" strokeWidth="1.5" opacity="0.45">
        <line x1="46" y1="70" x2="130" y2="40" />
        <line x1="130" y1="40" x2="228" y2="72" />
        <line x1="228" y1="72" x2="286" y2="150" />
        <line x1="286" y1="150" x2="206" y2="196" />
        <line x1="206" y1="196" x2="112" y2="214" />
        <line x1="112" y1="214" x2="46" y2="150" />
        <line x1="46" y1="150" x2="46" y2="70" />
        <line x1="130" y1="40" x2="160" y2="128" />
        <line x1="228" y1="72" x2="160" y2="128" />
        <line x1="112" y1="214" x2="160" y2="128" />
        <line x1="46" y1="150" x2="160" y2="128" />
        <line x1="206" y1="196" x2="160" y2="128" />
      </g>
      {/* nodes */}
      <g fill="currentColor">
        <circle cx="160" cy="128" r="7" />
        <circle cx="130" cy="40" r="5" />
        <circle cx="228" cy="72" r="5" />
        <circle cx="286" cy="150" r="5" />
        <circle cx="206" cy="196" r="5" />
        <circle cx="112" cy="214" r="5" />
        <circle cx="46" cy="150" r="5" />
        <circle cx="46" cy="70" r="5" />
      </g>
      {/* soft halos on a few nodes */}
      <g fill="currentColor" opacity="0.25">
        <circle cx="160" cy="128" r="14" />
        <circle cx="130" cy="40" r="10" />
        <circle cx="206" cy="196" r="10" />
      </g>
    </svg>
  );
}

/** Named registry — handy for mapping a string key to an illustration. */
export const ILLUSTRATIONS = {
  inbox: EmptyInbox,
  users: EmptyUsers,
  search: EmptySearch,
  disconnected: EmptyDisconnected,
  success: EmptySuccess,
  location: EmptyLocation,
} as const;

export type IllustrationName = keyof typeof ILLUSTRATIONS;
