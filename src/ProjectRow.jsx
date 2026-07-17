import { useState } from 'react';
import { usedHours, fmtHours, remainingStatus, remainingLabel, getWeeklyResourced, monthlyUsedHours, getMonthKeyForWeek, parseTime } from './utils';

function TimeCellInput({ value, onChange, placeholder, disabled }) {
  const [prevValue, setPrevValue] = useState(value);
  const [localVal, setLocalVal] = useState(value != null ? String(value) : '');
  const [isFocused, setIsFocused] = useState(false);

  if (value !== prevValue) {
    setPrevValue(value);
    if (!isFocused) {
      setLocalVal(value != null ? String(value) : '');
    }
  }

  const handleInputChange = (e) => {
    const raw = e.target.value;
    setLocalVal(raw);
    
    if (raw === '') {
      onChange('');
      return;
    }
    
    const parsed = parseTime(raw);
    if (parsed !== null && !isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    const parsed = parseTime(localVal);
    if (parsed !== null && !isNaN(parsed)) {
      onChange(parsed);
      setLocalVal(String(parsed));
    } else {
      onChange('');
      setLocalVal('');
    }
  };

  return (
    <input
      type="text"
      className="hour-input"
      placeholder={placeholder}
      disabled={disabled}
      value={localVal}
      onChange={handleInputChange}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
    />
  );
}

export default function ProjectRow({ 
  project, 
  weekKey, 
  visibleDays, 
  todayIndex, 
  dayTotals, 
  setEntry, 
  onEdit, 
  onDelete, 
  leaveDays = [], 
  leaveWeeks = {},
  draggedId,
  dragOverId,
  dragOverPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd
}) {
  const [canDrag, setCanDrag] = useState(false);

  const used = usedHours(project, weekKey, leaveDays);
  const weeklyResourced = getWeeklyResourced(project, weekKey, leaveWeeks, visibleDays);
  const unlimited = weeklyResourced === null || weeklyResourced === undefined;
  const remaining = unlimited ? null : weeklyResourced - used;
  const status = unlimited ? 'unlimited' : remainingStatus(remaining, weeklyResourced);
  const pct = (!unlimited && weeklyResourced > 0) ? Math.min((used / weeklyResourced) * 100, 100) : 0;

  const monthKey = getMonthKeyForWeek(weekKey);
  const monthlyResourced = project.monthlyResourcedHours;
  const hasMonthly = monthlyResourced !== null && monthlyResourced !== undefined;
  const showMonthly = !unlimited && hasMonthly && remaining <= 5;
  
  const mUsed = hasMonthly ? monthlyUsedHours(project, monthKey, leaveWeeks) : 0;
  const mRemaining = hasMonthly ? monthlyResourced - mUsed : null;
  const mStatus = hasMonthly ? remainingStatus(mRemaining, monthlyResourced) : 'unlimited';
  const mPct = hasMonthly && monthlyResourced > 0 ? Math.min((mUsed / monthlyResourced) * 100, 100) : 0;

  const weekEntries = project.entries?.[weekKey] || {};

  let rowClass = '';
  if (!unlimited) {
    if (remaining === 0) rowClass = ' row-used-up';
    else if (remaining < 0 && remaining >= -5) rowClass = ' row-over-slight';
    else if (remaining < -5) rowClass = ' row-over-severe';
  }

  const isDragging = draggedId === project.id;
  const isDragOver = dragOverId === project.id;

  const getColClass = (total, isLeave) => {
    const target = isLeave ? 0 : 7.6;
    if (isLeave && total > 0) return ' col-over';
    if (total === target) return ' col-perfect';
    if (total > target) return ' col-over';
    return '';
  };

  const handleChange = (dayIndex, val) => {
    setEntry(project.id, weekKey, dayIndex, val);
  };

  const handleDelete = () => {
    onDelete(project);
  };

  return (
    <tr 
      className={`project-row${rowClass}${isDragging ? ' dragging' : ''}${isDragOver && dragOverPosition ? ` drag-over-${dragOverPosition}` : ''}`}
      draggable={canDrag}
      onDragStart={(e) => onDragStart(e, project.id)}
      onDragOver={(e) => onDragOver(e, project.id)}
      onDragLeave={(e) => onDragLeave(e, project.id)}
      onDrop={(e) => onDrop(e, project.id)}
      onDragEnd={(e) => { setCanDrag(false); onDragEnd(e); }}
    >
      <td className="cell-project">
        <div className="project-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            className="drag-handle"
            onMouseDown={() => setCanDrag(true)}
            onMouseUp={() => setCanDrag(false)}
            style={{
              cursor: canDrag ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-muted)',
              opacity: 0.4,
              transition: 'opacity var(--transition), color var(--transition)',
              userSelect: 'none',
              padding: '4px',
              marginLeft: '-4px',
              flexShrink: 0
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => { e.currentTarget.style.opacity = 0.4; setCanDrag(false); }}
            title="Drag to reorder"
          >
            <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
              <circle cx="3" cy="4" r="1.2" />
              <circle cx="3" cy="8" r="1.2" />
              <circle cx="3" cy="12" r="1.2" />
              <circle cx="9" cy="4" r="1.2" />
              <circle cx="9" cy="8" r="1.2" />
              <circle cx="9" cy="12" r="1.2" />
            </svg>
          </div>
          {project.color && (
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: project.color, flexShrink: 0, marginRight: '4px' }} title={project.color} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            {(project.client || project.code) && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {project.client}{project.client && project.code ? ' · ' : ''}{project.code}
              </span>
            )}
          </div>
          {project.isBillable === false && (
            <span style={{ flexShrink: 0, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-hover)', color: 'var(--text-dim)', border: '1px solid var(--border)', textTransform: 'uppercase', fontWeight: 600 }}>Non-Billable</span>
          )}
          {project.status && project.status !== 'active' && (
            <span style={{ flexShrink: 0, fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: project.status === 'on-hold' ? 'rgba(217,119,6,0.1)' : 'rgba(220,38,38,0.1)', color: project.status === 'on-hold' ? '#d97706' : '#dc2626', border: '1px solid var(--border)', textTransform: 'uppercase', fontWeight: 600 }}>
              {project.status.replace('-', ' ')}
            </span>
          )}
        </div>
        {!unlimited ? (
          <>
            <div className="progress-bar-track">
              <div
                className={`progress-bar-fill status-${status}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className={`monthly-reveal progress-reveal ${showMonthly ? 'is-visible' : ''}`}>
              <div className="monthly-reveal-inner">
                <div className="progress-bar-track" title={`Monthly Progress: ${fmtHours(mUsed)}h / ${fmtHours(monthlyResourced)}h`}>
                  <div
                    className={`progress-bar-fill status-${mStatus}`}
                    style={{ width: `${mPct}%` }}
                  />
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="progress-bar-track">
            <div className="progress-bar-fill status-unlimited" style={{ width: '100%', opacity: 0.3 }} />
          </div>
        )}
      </td>

      {visibleDays.map((dayIdx, i) => {
        const val = weekEntries[dayIdx];
        const isLeave = leaveDays.includes(dayIdx);
        return (
          <td key={dayIdx} className={`cell-day${dayIdx === todayIndex ? ' cell-today' : ''}${getColClass(dayTotals[i], isLeave)}${isLeave ? ' cell-leave-day' : ''}`}>
            <TimeCellInput
              placeholder={isLeave ? "🌴" : "—"}
              disabled={isLeave}
              value={val != null && !isLeave ? val : ''}
              onChange={val => handleChange(dayIdx, val)}
            />
          </td>
        );
      })}

      <td className="cell-resourced">
        {unlimited ? <span className="unlimited-indicator">∞</span> : `${fmtHours(weeklyResourced)}h`}
      </td>
      <td className="cell-used">
        <div>{fmtHours(used)}h</div>
        <div className={`monthly-reveal text-reveal ${(hasMonthly && used > weeklyResourced) ? 'is-visible' : ''}`}>
          <div className="monthly-reveal-inner">
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
              +{fmtHours(used - weeklyResourced)}h
            </div>
          </div>
        </div>
      </td>
      <td className="cell-remaining">
        <span className={`badge status-${status}`}>
          {remainingLabel(remaining, weeklyResourced)}
        </span>
        <div className={`monthly-reveal text-reveal ${showMonthly ? 'is-visible' : ''}`}>
          <div className="monthly-reveal-inner">
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 600 }}>
              +{fmtHours(mRemaining)}h
            </div>
          </div>
        </div>
      </td>
      <td className="cell-actions">
        <button className="icon-btn" onClick={() => onEdit(project)} title="Edit project" aria-label="Edit project">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <button
          className="icon-btn"
          onClick={handleDelete}
          title="Delete project"
          aria-label="Delete project"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M5 4v8a1 1 0 001 1h4a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </td>
    </tr>
  );
}
