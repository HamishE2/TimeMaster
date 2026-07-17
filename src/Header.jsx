import { useState, useRef, useEffect } from 'react';
import { weekLabel, shiftWeek, weekKeyFor, DAY_SHORT } from './utils';

export default function Header({ weekKey, setWeekKey, visibleDays, toggleDay, onManageProjects, onImport, onOpenBackup }) {
  const todayKey = weekKeyFor(new Date());
  const isCurrentWeek = weekKey === todayKey;
  const [daysOpen, setDaysOpen] = useState(false);
  const daysRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!daysOpen) return;
    const onClick = (e) => {
      if (daysRef.current && !daysRef.current.contains(e.target)) setDaysOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [daysOpen]);

  return (
    <header className="header">
      <div className="header-brand">
        <svg className="header-logo" width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="8" fill="url(#logo-grad)"/>
          <path d="M8 14h3l2-4 3 8 2-6 2 2h2" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="logo-grad" x1="0" y1="0" x2="28" y2="28">
              <stop stopColor="#6366f1"/>
              <stop offset="1" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
        <span className="header-title">TimeMaster</span>
      </div>

      <div className="header-nav">
        <button
          className="nav-btn"
          onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
          aria-label="Previous week"
          title="Previous week"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        <span className="week-label">{weekLabel(weekKey, visibleDays)}</span>

        <button
          className="nav-btn"
          onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
          aria-label="Next week"
          title="Next week"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M7 4l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {!isCurrentWeek && (
          <button className="btn btn-today" onClick={() => setWeekKey(todayKey)}>
            This week
          </button>
        )}
      </div>

      <div className="header-actions">
        {/* Day settings dropdown */}
        <div className="days-dropdown-wrap" ref={daysRef}>
          <button
            className={`btn btn-days${daysOpen ? ' btn-days-active' : ''}`}
            onClick={() => setDaysOpen(!daysOpen)}
            title="Configure visible days"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            Days
          </button>

          {daysOpen && (
            <div className="days-dropdown">
              <div className="days-dropdown-title">Visible Days</div>
              {DAY_SHORT.map((name, idx) => (
                <label key={idx} className="days-dropdown-item">
                  <input
                    type="checkbox"
                    checked={visibleDays.includes(idx)}
                    onChange={() => toggleDay(idx)}
                    className="days-checkbox"
                  />
                  <span className="days-day-name">{name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button className="btn btn-import" onClick={onImport} title="Import CSV">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 2v8M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Import
        </button>

        <button className="btn btn-open-backup" onClick={onOpenBackup} title="Open Backup">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 6v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1h4l2 2h4a1 1 0 011 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Open
        </button>

        <button className="btn btn-projects" onClick={onManageProjects} title="Manage Projects">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10M3 8h10M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Projects
        </button>
      </div>
    </header>
  );
}
