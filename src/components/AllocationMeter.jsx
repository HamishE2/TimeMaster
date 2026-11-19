import { EPSILON, fmt } from '../lib/utils.js';

export default function AllocationMeter({
  label,
  fullLabel = label,
  used,
  allocation,
  frontloaded = 0,
  nativeAllocation = 0,
  frontloadedUsage = 0,
}) {
  const unlimited = allocation == null,
    debt = !unlimited && allocation < 0,
    available = unlimited ? 0 : Math.max(0, allocation),
    totalUsed = used + frontloadedUsage,
    scale = Math.max(available, totalUsed, EPSILON),
    sourceUsedWidth = Math.min(
      100,
      Math.max(0, (frontloadedUsage / scale) * 100),
    ),
    actualWidth = Math.min(
      100 - sourceUsedWidth,
      Math.max(0, (used / scale) * 100),
    ),
    native = Math.min(available, Math.max(0, nativeAllocation)),
    frontloadedAvailable = Math.min(
      frontloaded,
      Math.max(0, available - native),
    ),
    frontloadedUsed = Math.max(
      0,
      Math.min(frontloadedAvailable, used - native),
    ),
    nativeLeft = (native / scale) * 100,
    frontloadedWidth = (frontloadedAvailable / scale) * 100,
    frontloadedUsedWidth = (frontloadedUsed / scale) * 100,
    status = unlimited
      ? 'unlimited'
      : debt || totalUsed > available + EPSILON
        ? 'over'
        : Math.abs(totalUsed - available) <= EPSILON
          ? 'at'
          : 'under';
  return (
    <div
      className={`allocation-meter ${status}${frontloadedAvailable > EPSILON ? ' has-frontload' : ''}${frontloadedUsage > EPSILON ? ' has-frontload-usage' : ''}`}
    >
      <div>
        <span>{label}</span>
        <b>
          {unlimited
            ? 'Unlimited'
            : debt
              ? `0h available · ${fmt(-allocation)}h debt`
              : `${fmt(totalUsed)} / ${fmt(available)}h`}
        </b>
      </div>
      <i
        title={
          unlimited
            ? `${fullLabel}: unlimited`
            : debt
              ? `${fullLabel}: ${fmt(-allocation)}h over due to frontloading`
              : `${fullLabel}: ${fmt(totalUsed)} / ${fmt(available)}h`
        }
        aria-label={
          unlimited
            ? `${label}: unlimited`
            : debt
              ? `${label}: ${fmt(-allocation)} hours over due to frontloading`
              : `${label}: ${Math.round((totalUsed / scale) * 100)}% allocated`
        }
      >
        <b
          className="allocation-fill"
          style={{ left: `${sourceUsedWidth}%`, width: `${actualWidth}%` }}
        />
        {totalUsed > available + EPSILON && !unlimited && (
          <span
            className="overrun-segment"
            style={{ left: (100 * available) / scale + '%' }}
          />
        )}
        {frontloadedUsage > EPSILON && (
          <span
            className="frontload-source-used"
            style={{ width: `${sourceUsedWidth}%` }}
            title="frontloaded to previous week"
            tabIndex="0"
            aria-label="frontloaded to previous week"
          />
        )}
        {frontloadedAvailable > EPSILON && (
          <>
            <span
              className="frontload-cap"
              style={{ left: `${nativeLeft}%`, width: `${frontloadedWidth}%` }}
              title="frontloaded from next week"
              tabIndex="0"
              aria-label="frontloaded from next week"
            />
            <span
              className="frontload-used"
              style={{
                left: `${nativeLeft}%`,
                width: `${frontloadedUsedWidth}%`,
              }}
            />
          </>
        )}
      </i>
    </div>
  );
}
