export default function EmptyState({ onAdd }) {
  return (
    <div className="empty-state">
      <div className="empty-illustration">
        <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
          <circle cx="60" cy="60" r="56" fill="url(#empty-grad)" opacity="0.12"/>
          <rect x="30" y="38" width="60" height="44" rx="6" stroke="url(#empty-grad2)" strokeWidth="2.5" fill="none"/>
          <line x1="30" y1="52" x2="90" y2="52" stroke="url(#empty-grad2)" strokeWidth="2" opacity="0.5"/>
          <line x1="50" y1="38" x2="50" y2="82" stroke="url(#empty-grad2)" strokeWidth="1.5" opacity="0.3"/>
          <line x1="70" y1="38" x2="70" y2="82" stroke="url(#empty-grad2)" strokeWidth="1.5" opacity="0.3"/>
          <circle cx="60" cy="67" r="8" stroke="url(#empty-grad2)" strokeWidth="2" fill="none"/>
          <path d="M57 67l2 2 4-4" stroke="url(#empty-grad2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="empty-grad" x1="10" y1="10" x2="110" y2="110">
              <stop stopColor="#6366f1"/>
              <stop offset="1" stopColor="#a78bfa"/>
            </linearGradient>
            <linearGradient id="empty-grad2" x1="30" y1="30" x2="90" y2="90">
              <stop stopColor="#6366f1"/>
              <stop offset="1" stopColor="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
      <h2 className="empty-title">No projects yet</h2>
      <p className="empty-desc">
        Start tracking your time by adding your first project.<br/>
        Set a weekly hour budget and log time day by day.
      </p>
      <button className="btn btn-primary btn-lg" onClick={onAdd}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{marginRight: 8}}>
          <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        Add First Project
      </button>
    </div>
  );
}
