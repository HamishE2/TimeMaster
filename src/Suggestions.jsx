import { useState } from 'react';
import { usedHours, isUnlimited, fmtHours } from './utils';

function ProjectCard({ p, weekKey }) {
  const used = usedHours(p, weekKey);
  const unlimited = isUnlimited(p);
  const remaining = unlimited ? null : p.resourcedHours - used;

  let statusClass = 'status-green';
  if (unlimited) {
    statusClass = 'status-unlimited';
  } else if (remaining <= 0) {
    statusClass = 'status-light-red';
  } else if (remaining < 1) {
    statusClass = 'status-orange';
  }

  return (
    <div className="suggestion-card">
      <div className="suggestion-card-header">
        <h4>{p.name}</h4>
        {unlimited ? (
          <span className={`suggestion-badge ${statusClass}`}>Unlimited</span>
        ) : (
          <span className={`suggestion-badge ${statusClass}`}>
            {fmtHours(remaining)}h left
          </span>
        )}
      </div>
      <div className="suggestion-card-body">
        {!unlimited && (
          <div className="progress-bar-track">
            <div 
              className={`progress-bar-fill ${statusClass}`}
              style={{ width: `${Math.max(0, Math.min((used / p.resourcedHours) * 100, 100))}%` }}
            />
          </div>
        )}
        <div className="suggestion-stats">
          {unlimited ? (
            <span>Used: {fmtHours(used)}h</span>
          ) : (
            <>
              <span>Weekly Budget: {fmtHours(p.resourcedHours)}h</span>
              <span>Used: {fmtHours(used)}h</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Suggestions({ projects, weekKey }) {
  const [open, setOpen] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);

  if (!projects || projects.length === 0) return null;

  const healthy = [];

  projects.forEach(p => {
    if (isUnlimited(p)) {
      healthy.push(p);
    } else {
      const used = usedHours(p, weekKey);
      const remaining = p.resourcedHours - used;
      if (remaining >= 1) {
        healthy.push(p);
      }
    }
  });

  const renderSection = (title, list) => {
    if (list.length === 0) return null;

    const sorted = [...list].sort((a, b) => {
      const aUnlim = isUnlimited(a);
      const bUnlim = isUnlimited(b);
      if (aUnlim && bUnlim) return 0;
      if (aUnlim) return 1;
      if (bUnlim) return -1;

      const remA = a.resourcedHours - usedHours(a, weekKey);
      const remB = b.resourcedHours - usedHours(b, weekKey);
      return sortDesc ? remB - remA : remA - remB;
    });

    return (
      <div className="suggestions-section" style={{ marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', fontSize: '14px', color: 'var(--text-muted)' }}>{title}</h4>
        <div className="suggestions-list">
          {sorted.map(p => <ProjectCard key={p.id} p={p} weekKey={weekKey} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="suggestions-container">
      <button 
        className="btn btn-secondary suggestions-toggle-btn"
        onClick={() => setOpen(!open)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        {open ? 'Hide Suggestions' : 'Show Suggestions'}
      </button>

      {open && (
        <div className="suggestions-panel">
          <div className="suggestions-header">
            <h3>Suggested Projects</h3>
            <button 
              className="btn btn-icon sort-btn"
              onClick={() => setSortDesc(!sortDesc)}
              title="Toggle sort order"
            >
              Sort: {sortDesc ? 'Most Time Left' : 'Least Time Left'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: '4px' }}>
                <path d={sortDesc ? "M12 5v14M19 12l-7 7-7-7" : "M12 19V5M5 12l7-7 7 7"} />
              </svg>
            </button>
          </div>

          <div className="suggestions-content" style={{ marginTop: '16px' }}>
            {renderSection('Healthy Projects', healthy)}
          </div>
        </div>
      )}
    </div>
  );
}
