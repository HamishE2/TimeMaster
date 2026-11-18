const frontloadWarningIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <circle cx="10" cy="12" r="6" />
    <path d="M10 8v3.5M10 14.5v.5M16.5 6.5l3 5.25-3 5.25h-6" />
  </svg>
);

const FrontloadWarning = ({ metrics }) =>
  metrics.overDueToFrontloading ? (
    <span
      className="frontload-warning"
      title="Over limit due to frontloading"
      tabIndex="0"
      aria-label="Over limit due to frontloading"
    >
      {frontloadWarningIcon}
    </span>
  ) : null;

export default FrontloadWarning;
