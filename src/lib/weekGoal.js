// A week is "complete" when logged time reaches capacity and at least 80%
// of it is billable. Drives the one-shot celebration on the timesheet.
export const BILLABLE_GOAL = 0.8;

export function weekIsComplete(totals) {
  return (
    totals.capacity > 0 &&
    totals.logged >= totals.capacity - 0.01 &&
    totals.billable / Math.max(totals.logged, 0.01) >= BILLABLE_GOAL - 1e-9
  );
}
