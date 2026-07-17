import { usedHours, fmtHours } from './utils';

export default function BillableChart({ 
  projects, 
  allProjects = [], 
  weekKey, 
  leaveDays = [], 
  visibleDays = [], 
  setEntry 
}) {
  const totalBillable = projects.filter(p => p.isBillable !== false).reduce((s, p) => s + usedHours(p, weekKey, leaveDays), 0);
  const totalNonBillable = projects.filter(p => p.isBillable === false).reduce((s, p) => s + usedHours(p, weekKey, leaveDays), 0);
  const totalUsed = totalBillable + totalNonBillable;
  const pctBillable = totalUsed > 0 ? (totalBillable / totalUsed) * 100 : 0;

  const totalResourced = 7.6 * visibleDays.length;
  
  const pdProjectInView = projects.find(p => p.name.trim().toLowerCase() === 'professional development');
  const pdUsed = pdProjectInView ? usedHours(pdProjectInView, weekKey, leaveDays) : 0;
  const otherUsed = totalUsed - pdUsed;

  const pctOther = totalResourced > 0 ? Math.max(0, Math.min(100, (otherUsed / totalResourced) * 100)) : 0;
  const pctPd = totalResourced > 0 ? Math.max(0, Math.min(100 - pctOther, (pdUsed / totalResourced) * 100)) : 0;
  const pctUsed = totalResourced > 0 ? Math.max(0, Math.min(100, (totalUsed / totalResourced) * 100)) : 0;

  const handleFillPD = () => {
    const pdProj = allProjects.find(p => p.name.trim().toLowerCase() === 'professional development');
    if (!pdProj) {
      alert("Professional Development project not found.");
      return;
    }

    const remainingToFill = totalResourced - totalUsed;
    if (remainingToFill <= 0) return;

    const workingDays = visibleDays.filter(d => !leaveDays.includes(d));
    if (workingDays.length === 0) return;

    // Calculate current daily totals across all visible projects
    const dayTotalsMap = {};
    workingDays.forEach(dayIdx => {
      dayTotalsMap[dayIdx] = projects.reduce((sum, p) => {
        const v = p.entries?.[weekKey]?.[dayIdx];
        return sum + (v != null ? Number(v) : 0);
      }, 0);
    });

    const updates = {};
    let tempRemaining = remainingToFill;

    // First pass: fill working days up to 7.6 hours
    workingDays.forEach(dayIdx => {
      const currentDayTotal = dayTotalsMap[dayIdx];
      const spaceLeft = Math.max(0, 7.6 - currentDayTotal);
      const toAdd = Math.min(spaceLeft, tempRemaining);
      if (toAdd > 0) {
        const currentPDValue = Number(pdProj.entries?.[weekKey]?.[dayIdx]) || 0;
        updates[dayIdx] = currentPDValue + toAdd;
        tempRemaining -= toAdd;
      }
    });

    // Second pass: if we still have remaining time, add it to the first working day
    if (tempRemaining > 0) {
      const firstDay = workingDays[0];
      const currentPDValue = Number(pdProj.entries?.[weekKey]?.[firstDay]) || 0;
      updates[firstDay] = (updates[firstDay] ?? currentPDValue) + tempRemaining;
    }

    // Apply the updates
    Object.entries(updates).forEach(([dayIdx, val]) => {
      const roundedVal = Math.round(val * 2) / 2;
      setEntry(pdProj.id, weekKey, Number(dayIdx), roundedVal);
    });
  };

  return (
    <div className="billable-chart-container">
      <div className="billable-chart-card">
        <h3 className="chart-title">Billable Split</h3>
        <div className="pie-container">
          <div 
            className="pie-chart" 
            style={{ 
              background: `conic-gradient(var(--brand) 0% ${pctBillable}%, var(--bg-hover) ${pctBillable}% 100%)` 
            }}
          >
            <div className="pie-inner">
              <span className="pie-val">{pctBillable.toFixed(0)}%</span>
              <span className="pie-label">Billable</span>
            </div>
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item"><span className="legend-dot billable"></span> Billable ({totalBillable}h)</div>
          <div className="legend-item"><span className="legend-dot non-billable"></span> Non-Billable ({totalNonBillable}h)</div>
        </div>
      </div>

      <div className="billable-chart-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 className="chart-title" style={{ marginBottom: '8px' }}>Capacity Used</h3>
        
        {/* Horizontal filling bar */}
        <div className="progress-bar-track" style={{ display: 'flex', height: '8px', background: 'var(--bg-hover)', borderRadius: '4px', overflow: 'hidden' }}>
          {pctOther > 0 && (
            <div 
              style={{ 
                width: `${pctOther}%`, 
                background: 'linear-gradient(90deg, var(--brand) 0%, var(--green) 100%)',
                height: '100%'
              }}
            />
          )}
          {pctPd > 0 && (
            <div 
              style={{ 
                width: `${pctPd}%`, 
                background: '#60a5fa', 
                height: '100%',
                boxSizing: 'border-box',
                borderLeft: pctOther > 0 ? '2px solid var(--bg-hover)' : 'none'
              }}
            />
          )}
        </div>

        {/* Text Representation */}
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6', whiteSpace: 'pre-line', textAlign: 'center' }}>
          {pctUsed.toFixed(0)}% capacity used
          {"\n"}
          {fmtHours(totalUsed)}/{fmtHours(totalResourced)} hours used
          {"\n"}
          {fmtHours(Math.max(0, totalResourced - totalUsed))} hours remaining
        </div>

        {/* Fill with Professional Development Button */}
        <button 
          className="btn btn-ghost" 
          onClick={handleFillPD}
          style={{ width: '100%' }}
        >
          Fill with Professional Development
        </button>
      </div>
    </div>
  );
}
