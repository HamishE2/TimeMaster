// The app's one tick: a drawn, rounded check that takes the text colour, so
// it looks the same on every device (the typed ✓ comes from fallback fonts).
export default function CheckIcon({ size = 12, className }) {
  return (
    <svg
      className={className ? `check-icon ${className}` : 'check-icon'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}
