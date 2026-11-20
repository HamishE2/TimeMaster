import { useState } from 'react';
import {
  DAY_NAMES,
  fmt,
  DEFAULT_CAPACITY,
  DEFAULT_VISIBLE_DAYS,
} from '../lib/utils.js';
import Modal from './Modal.jsx';

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export default function Settings({ settings, onClose, onSave }) {
  const [draft, setDraft] = useState({
    ...settings,
    capacityByDay: [...(settings.capacityByDay || DEFAULT_CAPACITY)],
    visibleDays: [...(settings.visibleDays || DEFAULT_VISIBLE_DAYS)],
  });
  const weekly = draft.visibleDays.reduce(
    (sum, d) => sum + Number(draft.capacityByDay[d] || 0),
    0,
  );
  return (
    <Modal title="Workspace settings" onClose={onClose}>
      <fieldset className="settings-group">
        <legend>Theme</legend>
        <div className="theme-choice" role="radiogroup" aria-label="Theme">
          {THEMES.map(([value, label]) => (
            <button
              type="button"
              role="radio"
              key={value}
              aria-checked={(draft.theme || 'system') === value}
              className={`theme-${value}`}
              onClick={() => setDraft({ ...draft, theme: value })}
            >
              <span className="theme-preview" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="settings-group">
        <legend>Working days</legend>
        <ul className="working-days">
          {DAY_NAMES.map((name, i) => {
            const on = draft.visibleDays.includes(i);
            return (
              <li key={name} className={on ? 'is-on' : ''}>
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      const next = on
                        ? draft.visibleDays.filter((d) => d !== i)
                        : [...draft.visibleDays, i].sort();
                      if (next.length) setDraft({ ...draft, visibleDays: next });
                    }}
                  />
                  <span>{name}</span>
                </label>
                <span className="unit-input">
                  <input
                    aria-label={`${name} capacity in hours`}
                    disabled={!on}
                    type="number"
                    min="0"
                    max="24"
                    step="0.1"
                    value={draft.capacityByDay[i]}
                    onChange={(e) => {
                      const next = [...draft.capacityByDay];
                      next[i] = Math.max(0, Math.min(24, Number(e.target.value)));
                      setDraft({ ...draft, capacityByDay: next });
                    }}
                  />
                  <span>h</span>
                </span>
              </li>
            );
          })}
          <li className="working-total">
            <span>{draft.visibleDays.length} days</span>
            <strong>{fmt(weekly)}h / wk</strong>
          </li>
        </ul>
      </fieldset>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={() => onSave(draft)}>
          Save settings
        </button>
      </div>
    </Modal>
  );
}
