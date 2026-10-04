// Train Punctuality logo: left half the outline of a train seen from the front, right half a clock
// of the same height, whose hand leaves a fading trace. The same drawing is app/icon.svg (browser tab icon).
export default function Logo({ size = 44 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="logo-svg">
    <defs><clipPath id="tpL"><rect x="0" y="0" width="32" height="64"/></clipPath></defs>
    <rect x="1" y="1" width="62" height="62" rx="15" fill="#16233f"/>
    <g clipPath="url(#tpL)" fill="none" stroke="#ffc24b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
    <path d="M15 53 V25 C15 15.5 22 11 32 11"/>
    <path d="M19.5 28.5 C19.5 21.5 24.5 17.5 32 17.5 V31 H19.5 Z"/>
    <circle cx="23" cy="40.5" r="2.6"/>
    <path d="M15 53 H32"/>
    </g>
    <path d="M32 11 A21 21 0 0 1 32 53" fill="none" stroke="#ffc24b" strokeWidth="3" strokeLinecap="round"/>
    <g stroke="#ffc24b" strokeWidth="2.4" strokeLinecap="round"><line x1="42.61" y1="21.39" x2="44.73" y2="19.27"/><line x1="47.00" y1="32.00" x2="50.00" y2="32.00"/><line x1="42.61" y1="42.61" x2="44.73" y2="44.73"/></g>
    <path d="M32 32 L33.39 16.06 A16 16 0 0 1 45.11 22.82 Z" fill="#ffc24b" opacity="0.22"/>
    <line x1="32" y1="32" x2="45.11" y2="22.82" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"/>
    <circle cx="32" cy="32" r="2.6" fill="#ffffff"/>
    </svg>
  );
}
