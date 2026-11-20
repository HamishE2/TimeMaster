import WeekScope from './WeekScope.jsx';

// Options are [id, label, description, danger?]. Renders as a radio group.
export default function ScopePicker({ options, value, onChange, removing = false, label = 'Weeks affected' }) {
  return (
    <div className="scope-picker">
      <div className="scope-grid" role="radiogroup" aria-label={label}>
        {options.map(([id, title, description, danger]) => (
          <button
            type="button"
            role="radio"
            key={id}
            aria-checked={value === id}
            className={danger ? 'is-danger' : undefined}
            onClick={() => onChange(id)}
          >
            <WeekScope scope={id} removing={removing} />
            <span>
              <strong>{title}</strong>
              {description && <small>{description}</small>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
