import { usedHours, getWeeklyResourced, remainingStatus, fmtHours } from './utils';

export default function WeeklyResourcingLane({ projects, weekKey, leaveDays = [], leaveWeeks = {}, visibleDays = [] }) {
  // calculate total allocated
  let totalAllocated = 0;
  let totalUsed = 0;
  let unlimitedCount = 0;

  projects.forEach(p => {
    // only count active projects towards the total allocation
    if (p.status === 'closed' || p.status === 'on-hold') {
        // optionally skip them entirely, or just include their usage if they have any?
        // Let's include everything that's visible this week.
    }
    
    const used = usedHours(p, weekKey, leaveDays);
    totalUsed += used;

    const weeklyResourced = getWeeklyResourced(p, weekKey, leaveWeeks, visibleDays);
    if (weeklyResourced === null || weeklyResourced === undefined) {
      unlimitedCount++;
    } else {
      totalAllocated += weeklyResourced;
    }
  });

  const pct = totalAllocated > 0 ? Math.min((totalUsed / totalAllocated) * 100, 100) : 0;
  const remaining = totalAllocated - totalUsed;
  const status = remainingStatus(remaining, totalAllocated);

  return (
    <div className="reslane" style={{
      backgroundColor: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
      boxShadow: 'var(--shadow)',
      padding: '16px 20px',
      marginBottom: '20px'
    }}>
      <div className="rl-top" style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: '10px' }}>
        <span className="rl-title" style={{ fontSize: '13px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-muted)' }}>
          Weekly resourcing used
        </span>
        <span className="rl-fig" style={{ fontSize: '15px', fontWeight: '700', marginLeft: 'auto' }}>
          {fmtHours(totalUsed)} {totalAllocated > 0 || unlimitedCount === 0 ? `/ ${fmtHours(totalAllocated)} h` : 'h'}
          {totalAllocated > 0 && (
            <span className="pct" style={{ fontSize: '17px', marginLeft: '6px', color: `var(--${status})` }}>
              · {Math.round((totalUsed / totalAllocated) * 100)}%
            </span>
          )}
        </span>
      </div>
      <div className="bigbar" style={{ height: '12px', borderRadius: '8px', backgroundColor: 'var(--border)', overflow: 'hidden' }}>
        <div 
          className={`progress-bar-fill status-${status}`} 
          style={{ height: '100%', borderRadius: '8px', width: `${pct}%`, transition: 'width 0.3s ease' }}
        />
      </div>
    </div>
  );
}
