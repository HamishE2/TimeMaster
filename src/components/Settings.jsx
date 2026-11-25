import { useState } from 'react';
import {
  DAY_NAMES,
  fmt,
  DEFAULT_CAPACITY,
  DEFAULT_VISIBLE_DAYS,
} from '../lib/utils.js';
import Modal from './Modal.jsx';
import { parseRate, rateLevelsOf } from '../lib/budget.js';
import { uuid } from '../lib/utils.js';

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
  // Rate levels: the workspace's own list (none are built in), typed as text.
  const [levels, setLevels] = useState(() =>
    rateLevelsOf(settings).map((level) => ({
      id: level.id,
      name: level.name,
      rate: level.rate == null ? '' : String(level.rate),
    })),
  );
  const [roleId, setRoleId] = useState(settings.roleLevelId || '');
  const [levelErrors, setLevelErrors] = useState({});
  const namedLevels = levels.filter((level) => level.name.trim());
  const setLevel = (id, patch) => {
    const before = levels.find((level) => level.id === id);
    // Changing your role's rate moves your hourly rate with it, unless you
    // had typed a different one.
    if (id === roleId && 'rate' in patch && rateText === before.rate)
      setRateText(patch.rate);
    setLevels(
      levels.map((level) => (level.id === id ? { ...level, ...patch } : level)),
    );
    setLevelErrors({ ...levelErrors, [id]: '' });
  };
  const pickRole = (id) => {
    setRoleId(id);
    const level = levels.find((item) => item.id === id);
    if (level && parseRate(level.rate).value != null) {
      setRateText(String(parseRate(level.rate).value));
      setRateError('');
    }
  };
  const save = () => {
    const rate = parseRate(rateText);
    const errors = {};
    const rateLevels = namedLevels.map((level) => {
      const parsed = parseRate(level.rate);
      if (parsed.error) errors[level.id] = parsed.error;
      return { id: level.id, name: level.name.trim(), rate: parsed.value };
    });
    setLevelErrors(errors);
    if (rate.error) setRateError(rate.error);
    if (rate.error || Object.keys(errors).length) return;
    onSave({
      ...draft,
      hourlyRate: rate.value,
      rateLevels,
      roleLevelId: rateLevels.some((level) => level.id === roleId)
        ? roleId
        : null,
    });
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
        <label htmlFor="settings-role">Your role</label>
        <select
          id="settings-role"
          value={namedLevels.some((level) => level.id === roleId) ? roleId : ''}
          onChange={(e) => pickRole(e.target.value)}
          aria-describedby="settings-role-help"
        >
          <option value="">Not set</option>
          {namedLevels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name.trim()}
            </option>
          ))}
        </select>
        <small id="settings-role-help" className="help">
          Lists the levels you add below. Picking one fills in your hourly rate.
        </small>
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
        <span className="settings-levels-label" id="settings-levels-label">
          Rate levels
        </span>
        <ul className="settings-levels" aria-labelledby="settings-levels-label">
          {levels.length === 0 && (
            <li className="settings-levels-empty">
              No levels yet. Add your own: none are built in.
            </li>
          )}
          {levels.map((level, index) => (
            <li key={level.id}>
              <input
                aria-label={`Level ${index + 1} name`}
                placeholder="Level name"
                value={level.name}
                maxLength={60}
                onChange={(e) => setLevel(level.id, { name: e.target.value })}
              />
              <span
                className={`unit-input ${levelErrors[level.id] ? 'input-error' : ''}`}
              >
                <span aria-hidden="true">$</span>
                <input
                  aria-label={`${level.name.trim() || `Level ${index + 1}`} hourly rate`}
                  inputMode="decimal"
                  placeholder="Rate"
                  value={level.rate}
                  aria-invalid={!!levelErrors[level.id]}
                  onChange={(e) => setLevel(level.id, { rate: e.target.value })}
                />
                <span>/ h</span>
              </span>
              <button
                type="button"
                className="settings-level-remove"
                aria-label={`Remove ${level.name.trim() || `level ${index + 1}`}`}
                onClick={() => {
                  setLevels(levels.filter((item) => item.id !== level.id));
                  if (roleId === level.id) setRoleId('');
                }}
              >
                ×
              </button>
              {levelErrors[level.id] && (
                <small className="field-error" role="alert">
                  {levelErrors[level.id]}
                </small>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="settings-level-add"
          onClick={() =>
            setLevels([
              ...levels,
              { id: `level-${uuid()}`, name: '', rate: '' },
            ])
          }
        >
          + Add level
        </button>
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
