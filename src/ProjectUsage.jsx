import { useState } from 'react';
import { usedHours, getWeeklyResourced, monthlyUsedHours, fmtHours, getMonthKeyForWeek } from './utils';

function ProjectMiniCard({ p, weekKey, onEdit, onDelete, usageView, leaveWeeks = {}, visibleDays }) {
  const leaveDays = leaveWeeks[weekKey] || [];
  const used = usedHours(p, weekKey, leaveDays);
  const weeklyResourced = getWeeklyResourced(p, weekKey, leaveWeeks, visibleDays);
  const unlimited = weeklyResourced === null || weeklyResourced === undefined;
  const remaining = unlimited ? null : weeklyResourced - used;
  let statusClass = 'status-green';
  if (unlimited) {
    statusClass = 'status-unlimited';
  } else if (remaining < 0) {
    statusClass = 'status-dark-red';
  } else if (remaining === 0) {
    statusClass = 'status-light-red';
  } else if (remaining < 1) {
    statusClass = 'status-orange';
  }

  const monthKey = getMonthKeyForWeek(weekKey);
  const monthlyResourced = p.monthlyResourcedHours;
  const hasMonthly = monthlyResourced !== null && monthlyResourced !== undefined;
  const showMonthly = hasMonthly;
  
  const mUsed = hasMonthly ? monthlyUsedHours(p, monthKey, leaveWeeks) : 0;
  const mRemaining = hasMonthly ? monthlyResourced - mUsed : null;
  const mPct = hasMonthly && monthlyResourced > 0 ? Math.min((mUsed / monthlyResourced) * 100, 100) : 0;

  let mStatusClass = 'status-green';
  if (!hasMonthly) {
    mStatusClass = 'status-unlimited';
  } else if (mRemaining < 0) {
    mStatusClass = 'status-dark-red';
  } else if (mRemaining === 0) {
    mStatusClass = 'status-light-red';
  } else if (mRemaining < 1) {
    mStatusClass = 'status-orange';
  }

  const displayStatusClass = usageView === 'monthly' ? mStatusClass : statusClass;
  const displayUnlimited = usageView === 'monthly' ? !hasMonthly : unlimited;
  const displayRemaining = usageView === 'monthly' ? mRemaining : remaining;

  return (
    <div className="suggestion-card" style={{ marginBottom: '12px' }}>
      <div className="suggestion-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: '600', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{p.name}</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
          <span className={`suggestion-badge ${displayStatusClass}`} style={{ fontSize: '10px', padding: '2px 6px' }}>
            {displayUnlimited ? 'Unlimited' : `${fmtHours(displayRemaining)}h left`}
          </span>
          <button className="icon-btn" onClick={() => onEdit(p)} title="Edit project" aria-label="Edit project" style={{ width: '24px', height: '24px' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <button className="icon-btn" onClick={() => onDelete(p)} title="Delete project" aria-label="Delete project" style={{ width: '24px', height: '24px' }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
      <div className="suggestion-card-body">
        {(!unlimited || showMonthly) && (
          <>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: '600', marginBottom: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px' }}>Allocation</div>
            
            {!unlimited && (
              <div style={{ marginBottom: showMonthly ? '8px' : '0' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '2px' }}>Weekly</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div className="progress-bar-track" style={{ height: '3px', marginBottom: 0, background: 'var(--border-light)', flex: 1 }}>
                    <div 
                      className={`progress-bar-fill ${statusClass}`}
                      style={{ width: `${Math.max(0, Math.min((used / weeklyResourced) * 100, 100))}%` }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, minWidth: '28px', textAlign: 'right' }}>
                    {Math.round((used / weeklyResourced) * 100)}%
                  </span>
                </div>
              </div>
            )}

            {showMonthly && (
              <div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '2px' }}>Monthly</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} title={`Monthly Progress: ${fmtHours(mUsed)}h / ${fmtHours(monthlyResourced)}h`}>
                  <div className="progress-bar-track" style={{ height: '3px', marginBottom: 0, background: 'var(--border-light)', flex: 1 }}>
                    <div
                      className={`progress-bar-fill ${mStatusClass}`}
                      style={{ width: `${mPct}%` }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600, minWidth: '28px', textAlign: 'right' }}>
                    {Math.round((mUsed / monthlyResourced) * 100)}%
                  </span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, titleColor, items, weekKey, onEdit, onDelete, usageView, leaveWeeks, defaultOpen = true, visibleDays }) {
  const [open, setOpen] = useState(defaultOpen);
  if (items.length === 0) return null;

  return (
    <div className="suggestions-section" style={{ marginBottom: '20px' }}>
      <div 
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: '10px', padding: '4px 0' }}
      >
        <h4 style={{ margin: 0, fontSize: '14px', color: titleColor }}>
          {title} ({items.length})
        </h4>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: 'var(--text-muted)' }}>
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      {open && (
        <div className="suggestions-list">
          {items.map(p => <ProjectMiniCard key={p.id} p={p} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} visibleDays={visibleDays} />)}
        </div>
      )}
    </div>
  );
}

export default function ProjectUsage({ projects, weekKey, onEdit, onDelete, leaveWeeks = {}, visibleDays = [0, 1, 2, 3, 4] }) {
  const [usageView, setUsageView] = useState('weekly');

  if (!projects || projects.length === 0) return null;

  const over = [];
  const exhausted = [];
  const nearlyExhausted = [];
  const healthy = [];
  const unlimited = [];

  const monthKey = getMonthKeyForWeek(weekKey);
  const leaveDays = leaveWeeks[weekKey] || [];

  projects.forEach(p => {
    let isUnlim, remaining;

    if (usageView === 'monthly') {
      const monthlyResourced = p.monthlyResourcedHours;
      isUnlim = monthlyResourced === null || monthlyResourced === undefined;
      if (!isUnlim) {
        const used = monthlyUsedHours(p, monthKey, leaveWeeks);
        remaining = monthlyResourced - used;
      }
    } else {
      const weeklyResourced = getWeeklyResourced(p, weekKey, leaveWeeks, visibleDays);
      isUnlim = weeklyResourced === null || weeklyResourced === undefined;
      if (!isUnlim) {
        const used = usedHours(p, weekKey, leaveDays);
        remaining = weeklyResourced - used;
      }
    }

    // Check if over 100% in ANY bucket
    let isOverAny = false;
    
    // Check weekly bucket
    const weeklyResourcedForOver = getWeeklyResourced(p, weekKey, leaveWeeks, visibleDays);
    if (weeklyResourcedForOver !== null && weeklyResourcedForOver !== undefined) {
      const used = usedHours(p, weekKey, leaveDays);
      if (weeklyResourcedForOver - used < 0) {
        isOverAny = true;
      }
    }
    // Check monthly bucket
    const monthlyResourcedForOver = p.monthlyResourcedHours;
    if (monthlyResourcedForOver !== null && monthlyResourcedForOver !== undefined) {
      const used = monthlyUsedHours(p, monthKey, leaveWeeks);
      if (monthlyResourcedForOver - used < 0) {
        isOverAny = true;
      }
    }

    if (isOverAny) {
      over.push(p);
    } else if (isUnlim) {
      unlimited.push(p);
    } else {
      if (remaining === 0) {
        exhausted.push(p);
      } else if (remaining < 1) {
        nearlyExhausted.push(p);
      } else {
        healthy.push(p);
      }
    }
  });

  const sortByRem = (a, b) => {
    let aUnlim, bUnlim, aRem, bRem;
    if (usageView === 'monthly') {
       const aRes = a.monthlyResourcedHours;
       aUnlim = aRes === null || aRes === undefined;
       if (!aUnlim) aRem = aRes - monthlyUsedHours(a, monthKey, leaveWeeks);

       const bRes = b.monthlyResourcedHours;
       bUnlim = bRes === null || bRes === undefined;
       if (!bUnlim) bRem = bRes - monthlyUsedHours(b, monthKey, leaveWeeks);
    } else {
       const aRes = getWeeklyResourced(a, weekKey, leaveWeeks, visibleDays);
       aUnlim = aRes === null || aRes === undefined;
       if (!aUnlim) aRem = aRes - usedHours(a, weekKey, leaveDays);

       const bRes = getWeeklyResourced(b, weekKey, leaveWeeks, visibleDays);
       bUnlim = bRes === null || bRes === undefined;
       if (!bUnlim) bRem = bRes - usedHours(b, weekKey, leaveDays);
    }

    if (aUnlim && bUnlim) return 0;
    if (aUnlim) return 1;
    if (bUnlim) return -1;
    return aRem - bRem;
  };

  over.sort(sortByRem);
  exhausted.sort(sortByRem);
  nearlyExhausted.sort(sortByRem);
  healthy.sort((a, b) => sortByRem(b, a)); // Sort healthy by most remaining
  unlimited.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="billable-chart-card project-usage-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h3 className="chart-title" style={{ margin: 0 }}>Project Usage</h3>
        <select 
          value={usageView} 
          onChange={e => setUsageView(e.target.value)}
          style={{ 
            padding: '4px 8px', 
            borderRadius: '4px', 
            border: '1px solid var(--border)', 
            background: 'var(--bg-elevated)', 
            color: 'var(--text)', 
            fontSize: '12px',
            outline: 'none',
            cursor: 'pointer'
          }}
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </div>
      <div className="project-usage-sections">
        <CollapsibleSection title="Healthy" titleColor="var(--green)" items={healthy} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} defaultOpen={true} visibleDays={visibleDays} />
        <CollapsibleSection title="Nearly Exhausted" titleColor="var(--orange)" items={nearlyExhausted} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} defaultOpen={true} visibleDays={visibleDays} />
        <CollapsibleSection title="Exhausted" titleColor="var(--light-red)" items={exhausted} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} defaultOpen={true} visibleDays={visibleDays} />
        <CollapsibleSection title="Over" titleColor="var(--dark-red)" items={over} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} defaultOpen={true} visibleDays={visibleDays} />
        <CollapsibleSection title="Unlimited" titleColor="var(--purple)" items={unlimited} weekKey={weekKey} onEdit={onEdit} onDelete={onDelete} usageView={usageView} leaveWeeks={leaveWeeks} defaultOpen={true} visibleDays={visibleDays} />
      </div>
    </div>
  );
}
