/** BrandMark - logo resmi JABNET Workspace (v5.8).
 *  Konsep "signal core": inti bercahaya + gelombang sinyal konsentris dalam badge
 *  gradient sky->blue (fiber/broadcast). Identik dengan favicon. Tajam di semua ukuran.
 *  Dibungkus <span> rounded+overflow-hidden agar shadow/ring dari className menempel
 *  presisi pada tepi badge (badge mengisi penuh viewBox). */
export function BrandMark({ className = "", title = "JABNET Workspace" }: { className?: string; title?: string }) {
  return (
    <span className={`relative inline-block shrink-0 overflow-hidden rounded-xl ${className}`} role="img" aria-label={title}>
      <svg viewBox="0 0 48 48" className="block h-full w-full" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="bm-bg" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#38BDF8" />
            <stop offset="0.55" stopColor="#0EA5E9" />
            <stop offset="1" stopColor="#1D4ED8" />
          </linearGradient>
          <radialGradient id="bm-hi" cx="33%" cy="24%" r="72%">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="bm-core" cx="50%" cy="45%" r="60%">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#DBEAFE" />
          </radialGradient>
        </defs>
        <rect width="48" height="48" fill="url(#bm-bg)" />
        <rect width="48" height="48" fill="url(#bm-hi)" />
        <g fill="none" stroke="#FFFFFF" strokeLinecap="round">
          <circle cx="24" cy="24" r="14.5" strokeOpacity="0.20" strokeWidth="2" />
          <circle cx="24" cy="24" r="10" strokeOpacity="0.42" strokeWidth="2.2" />
          <circle cx="24" cy="24" r="5.5" strokeOpacity="0.82" strokeWidth="2.4" />
        </g>
        <circle cx="24" cy="24" r="3.2" fill="url(#bm-core)" />
      </svg>
    </span>
  );
}
