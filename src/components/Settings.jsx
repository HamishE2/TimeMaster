import { useState } from 'react';
import {
  DAY_NAMES,
  DAY_SHORT,
  DEFAULT_CAPACITY,
  DEFAULT_VISIBLE_DAYS,
} from '../lib/utils.js';
import Modal from './Modal.jsx';

export default function Settings({ settings, onClose, onSave }) {
  const [draft, setDraft] = useState({
    ...settings,
    capacityByDay: [...(settings.capacityByDay || DEFAULT_CAPACITY)],
    visibleDays: [...(settings.visibleDays || DEFAULT_VISIBLE_DAYS)],
  });
  return (
    <Modal title="Workspace settings" onClose={onClose}>
      <label>
        Theme
        <select
          value={draft.theme}
          onChange={(e) => setDraft({ ...draft, theme: e.target.value })}
        >
          <option value="system">Use device theme</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <fieldset>
        <legend>Visible days</legend>
        <div className="checks">
          {DAY_NAMES.map((name, i) => (
            <label className="check" key={name}>
              <input
                type="checkbox"
                checked={draft.visibleDays.includes(i)}
                onChange={() => {
                  const next = draft.visibleDays.includes(i)
                    ? draft.visibleDays.filter((d) => d !== i)
                    : [...draft.visibleDays, i].sort();
                  if (next.length) setDraft({ ...draft, visibleDays: next });
                }}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Working capacity</legend>
        <div className="capacity-inputs">
          {DAY_SHORT.map((day, i) => (
            <label key={day}>
              {day}
              <input
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
            </label>
          ))}
        </div>
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
