import { useState } from 'react';
import {
  DAY_NAMES,
  fmt,
  DEFAULT_CAPACITY,
  DEFAULT_VISIBLE_DAYS,
} from '../lib/utils.js';
import Modal from './Modal.jsx';
import { parseRate } from '../lib/budget.js';

const THEMES = [
  ['system', 'System'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

export default function Settings({ settings, focus, onClose, onSave }) {
  const [draft, setDraft] = useState({
    ...settings,
    capacityByDay: [...(settings.capacityByDay || DEFAULT_CAPACITY)],
    visibleDays: [...(settings.visibleDays || DEFAULT_VISIBLE_DAYS)],
  });
  const [rateText, setRateText] = useState(
      settings.hourlyRate == null ? '' : String(settings.hourlyRate),
    ),
    [rateError, setRateError] = useState('');
  const save = () => {
    const rate = parseRate(rateText);
    if (rate.error) {
      setRateError(rate.error);
      return;
    }
    onSave({ ...draft, hourlyRate: rate.value });
  };
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
      <fieldset className="settings-group settings-billing">
        <legend>Billing</legend>
        <label htmlFor="settings-hourly-rate">Hourly rate</label>
        <span className={`unit-input ${rateError ? 'input-error' : ''}`}>
          <span aria-hidden="true">$</span>
          <input
            id="settings-hourly-rate"
            autoFocus={focus === 'rate'}
            inputMode="decimal"
            placeholder="Not set"
            value={rateText}
            aria-invalid={!!rateError}
            aria-describedby="settings-hourly-rate-help"
            onChange={(e) => {
              setRateText(e.target.value);
              setRateError('');
            }}
            onBlur={() => {
              const rate = parseRate(rateText);
              if (rate.error) setRateError(rate.error);
              else if (rate.value != null) setRateText(String(rate.value));
            }}
          />
          <span>AUD / h</span>
        </span>
        <small
          id="settings-hourly-rate-help"
          className={rateError ? 'field-error' : 'help'}
          role={rateError ? 'alert' : undefined}
        >
          {rateError ||
            'Cost per logged hour. Projects can override it. Blank turns costing off.'}
        </small>
      </fieldset>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button className="primary" onClick={save}>
          Save settings
        </button>
      </div>
    </Modal>
  );
}
