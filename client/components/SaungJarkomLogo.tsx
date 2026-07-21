/**
 * Saung Jarkom - Custom brand logo
 * House (saung) + wifi signal (jarkom). Uses `currentColor` so it inherits
 * whatever text/fill color the parent sets (e.g. text-white on primary bg).
 */
export function SaungJarkomLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Saung Jarkom"
    >
      {/* House / saung silhouette */}
      <path
        d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"
        fill="currentColor"
        fillOpacity="0.18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {/* Wifi dot */}
      <circle cx="12" cy="18.5" r="1.35" fill="currentColor" />
      {/* Wifi inner arc */}
      <path
        d="M9.8 16.2a3.1 3.1 0 0 1 4.4 0"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        fill="none"
      />
      {/* Wifi outer arc */}
      <path
        d="M7.5 14a6.5 6.5 0 0 1 9 0"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        fill="none"
        opacity="0.55"
      />
    </svg>
  );
}
