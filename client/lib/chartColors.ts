// ==================== CHART COLORS (Theme-aware) ====================
// Single source of truth for Recharts colors. Values are HSL wrappers around
// CSS variables defined in client/index.css - so they auto-adapt to light/dark mode.
//
// Usage:
//   import { CHART_COLORS, CHART_PALETTE } from "@/lib/chartColors";
//   <Cell fill={CHART_COLORS.primary} />
//   {data.map((d, i) => <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />)}

const hsl = (v: string) => `hsl(var(${v}))`;

export const CHART_COLORS = {
  primary: hsl("--chart-1"),   // sky blue
  success: hsl("--chart-2"),   // emerald
  warning: hsl("--chart-3"),   // amber
  violet: hsl("--chart-4"),    // violet
  danger: hsl("--chart-5"),    // red
  teal: hsl("--chart-6"),      // teal
  orange: hsl("--chart-7"),    // orange
  purple: hsl("--chart-8"),    // purple
  muted: hsl("--muted"),
  mutedForeground: hsl("--muted-foreground"),
} as const;

/**
 * Default palette for multi-series charts. Order optimized for perceptual
 * distinction (adjacent colors are hue-different, not just shade-shifted).
 */
export const CHART_PALETTE = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.warning,
  CHART_COLORS.violet,
  CHART_COLORS.danger,
  CHART_COLORS.teal,
  CHART_COLORS.orange,
  CHART_COLORS.purple,
] as const;

/**
 * Usage pie/donut pair - used vs. available (e.g. port utilization).
 */
export const USAGE_COLORS = {
  used: CHART_COLORS.primary,
  available: CHART_COLORS.muted,
} as const;

/**
 * Cable type colors - feeder / distribution / drop. Matches asset-cable semantic
 * across the app.
 */
export const CABLE_CHART_COLORS = {
  feeder: CHART_COLORS.violet,
  distribution: CHART_COLORS.success,
  drop: CHART_COLORS.warning,
} as const;

/**
 * Status colors - success / warning / danger - for alert banners, status badges
 * in charts, and health score segments.
 */
export const STATUS_COLORS = {
  success: CHART_COLORS.success,
  warning: CHART_COLORS.warning,
  danger: CHART_COLORS.danger,
  info: CHART_COLORS.primary,
} as const;

/**
 * Get a chart color by index (wraps around palette).
 */
export function getChartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

/**
 * Theme-aware tooltip styling for Recharts <Tooltip>.
 * Use: <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
 */
export const CHART_TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "0.5rem",
  fontSize: "0.75rem",
  padding: "0.5rem 0.75rem",
  boxShadow: "var(--shadow-md)",
  color: "hsl(var(--popover-foreground))",
};

/**
 * Theme-aware grid/axis color for Recharts.
 */
export const CHART_GRID_COLOR = "hsl(var(--border))";
export const CHART_AXIS_COLOR = "hsl(var(--muted-foreground))";
