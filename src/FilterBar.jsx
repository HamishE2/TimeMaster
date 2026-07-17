
export default function FilterBar({ query, setQuery, filters, setFilters }) {
  const toggleFilter = (key) => {
    setFilters(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAll = () => {
    setQuery('');
    setFilters({
      logged: false, unlogged: false,
      over: false, under: false, at: false,
      billable: false, nonBillable: false
    });
  };

  const hasFilters = query !== '' || Object.values(filters).some(Boolean);

  return (
    <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '24px', alignItems: 'center', backgroundColor: 'var(--bg-glass)', padding: '16px 20px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', backdropFilter: 'blur(12px)' }}>
      <div className="search-box" style={{ position: 'relative', flexGrow: 1, minWidth: '240px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input 
          type="text" 
          value={query} 
          onChange={e => setQuery(e.target.value)} 
          placeholder="Search by name, '> 5', 'under 10 hours'..." 
          className="filter-search-input"
          style={{ width: '100%', padding: '10px 16px 10px 42px', borderRadius: '24px', border: '1px solid var(--border)', backgroundColor: 'var(--bg-card)', color: 'var(--text)', fontSize: '14px', transition: 'all 0.2s ease', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.05)' }}
          onFocus={e => { e.target.style.borderColor = 'var(--brand)'; e.target.style.boxShadow = '0 0 0 3px var(--brand-glow)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'inset 0 2px 4px rgba(0,0,0,0.05)'; }}
        />
      </div>

      <div className="filter-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className={`btn-filter ${filters.logged ? 'active' : ''}`} onClick={() => toggleFilter('logged')}>Logged</button>
        <button className={`btn-filter ${filters.unlogged ? 'active' : ''}`} onClick={() => toggleFilter('unlogged')}>Unlogged</button>
      </div>

      <div className="filter-divider" style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }}></div>

      <div className="filter-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className={`btn-filter ${filters.over ? 'active' : ''}`} onClick={() => toggleFilter('over')}>Over</button>
        <button className={`btn-filter ${filters.under ? 'active' : ''}`} onClick={() => toggleFilter('under')}>Under</button>
        <button className={`btn-filter ${filters.at ? 'active' : ''}`} onClick={() => toggleFilter('at')}>At Capacity</button>
      </div>

      <div className="filter-divider" style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }}></div>

      <div className="filter-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button className={`btn-filter ${filters.billable ? 'active' : ''}`} onClick={() => toggleFilter('billable')}>Billable</button>
        <button className={`btn-filter ${filters.nonBillable ? 'active' : ''}`} onClick={() => toggleFilter('nonBillable')}>Non-Billable</button>
      </div>

      {hasFilters && (
        <button onClick={clearAll} style={{ marginLeft: 'auto', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '24px', padding: '6px 12px', color: 'var(--text-muted)', fontSize: '12.5px', cursor: 'pointer', transition: 'all 0.2s ease', fontWeight: 500 }}
          onMouseOver={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'; }}
          onMouseOut={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
        >
          Clear All
        </button>
      )}
    </div>
  );
}
