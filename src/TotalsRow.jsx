import { usedHours, fmtHours, remainingStatus, remainingLabel, isUnlimited, getWeeklyResourced } from './utils';

export default function TotalsRow({ projects, weekKey, visibleDays, todayIndex, dayTotals, leaveDays = [], leaveWeeks = {} }) {
  // Separate limited and unlimited projects for totals
  const limitedProjects = projects.filter(p => !isUnlimited(p));
  const totalResourced = limitedProjects.reduce((s, p) => s + getWeeklyResourced(p, weekKey, leaveWeeks, visibleDays), 0);
  const totalUsed = projects.reduce((s, p) => s + usedHours(p, weekKey, leaveDays), 0);
  const totalBillableUsed = projects.filter(p => p.isBillable !== false).reduce((s, p) => s + usedHours(p, weekKey, leaveDays), 0);
  const billablePct = totalUsed > 0 ? ((totalBillableUsed / totalUsed) * 100).toFixed(0) : 0;
  
  const hasUnlimited = projects.some(p => isUnlimited(p));
  const limitedUsed = limitedProjects.reduce((s, p) => s + usedHours(p, weekKey, leaveDays), 0);
  const totalRemaining = totalResourced - limitedUsed;
  const status = remainingStatus(totalRemaining, totalResourced);

  const getColClass = (total, isLeave) => {
    const target = isLeave ? 0 : 7.6;
    if (isLeave && total > 0) return ' col-over';
    if (total === target) return ' col-perfect';
    if (total > target) return ' col-over';
    return '';
  };

  return (
    <tr className="totals-row">
      <td className="cell-project cell-total-label">Week Total</td>
      {dayTotals.map((t, i) => {
        const isLeave = leaveDays.includes(visibleDays[i]);
        return (
          <td key={visibleDays[i]} className={`cell-day cell-day-total${visibleDays[i] === todayIndex ? ' cell-today' : ''}${getColClass(t, isLeave)}${isLeave ? ' cell-leave-day' : ''}`}>
            {isLeave ? "🌴" : (t > 0 ? `${fmtHours(t)}h` : '')}
          </td>
        );
      })}
      <td className="cell-resourced cell-total">
        {fmtHours(totalResourced)}h{hasUnlimited ? ' +∞' : ''}
      </td>
      <td className="cell-used cell-total">
        <div>{fmtHours(totalUsed)}h</div>
        {totalUsed > 0 && (
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginTop: '4px' }}>
            {billablePct}% Billable
          </div>
        )}
      </td>
      <td className="cell-remaining">
        <span className={`badge status-${status}`}>
          {remainingLabel(totalRemaining, totalResourced > 0 ? totalResourced : null)}
        </span>
      </td>
      <td className="cell-actions"></td>
    </tr>
  );
}
