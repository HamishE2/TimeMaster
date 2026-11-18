import { useState } from 'react';
import {
  EPSILON,
  fmt,
  frontloadAmount,
  frontloadLimit,
  projectMetrics,
  shiftWeek,
  weekLabel,
} from '../lib/utils.js';
import Modal from './Modal.jsx';

export default function FrontloadModal({
  project,
  week,
  leaveWeeks,
  onClose,
  onSave,
  title = 'Frontload hours',
  initialAmount = 0,
  preferInitial = false,
}) {
  const existing = frontloadAmount(project, week),
    next = shiftWeek(week, 1),
    cap = frontloadLimit(project, week),
    maximum = Math.max(existing, cap ?? 0),
    suggested = Math.min(maximum, Math.max(0, initialAmount)),
    initial = preferInitial ? suggested : existing || suggested,
    [value, setValue] = useState(initial ? String(initial) : ''),
    [error, setError] = useState(''),
    candidate = value.trim() === '' ? 0 : Number(value),
    validFormat = value.trim() === '' || /^\d+(\.\d{1,2})?$/.test(value.trim()),
    valid =
      validFormat &&
      Number.isFinite(candidate) &&
      candidate >= 0 &&
      candidate <= maximum + EPSILON,
    draft = {
      ...project,
      frontloads: { ...(project.frontloads || {}), [week]: candidate },
    },
    currentSource = projectMetrics(project, next, leaveWeeks),
    nextSource = projectMetrics(draft, next, leaveWeeks),
    destination = projectMetrics(draft, week, leaveWeeks),
    metrics = projectMetrics(project, week, leaveWeeks),
    overage = Math.max(
      0,
      metrics.logged - Math.max(0, Number(metrics.plan || 0)),
    ),
    currentLow = (currentSource.weeklyAvailable ?? 0) < 3 - EPSILON,
    nextLow = (nextSource.weeklyAvailable ?? 0) < 3 - EPSILON,
    warningHours = nextLow
      ? nextSource.weeklyAvailable
      : currentSource.weeklyAvailable,
    monthlyLimited =
      destination.weeklyAllowance != null &&
      destination.monthly != null &&
      destination.monthly < destination.weeklyAllowance - EPSILON;
  const submit = () => {
    if (!valid) {
      setError(`Enter an amount between 0 and ${fmt(maximum)} hours.`);
      return;
    }
    if (onSave(candidate) !== false) onClose();
  };
  const adjustToOverage = () => {
    if (onSave(overage) !== false) onClose();
  };
  return (
    <Modal title={title} onClose={onClose}>
      <p className="help">
        Use hours from <b>{weekLabel(next)}</b> for <b>{weekLabel(week)}</b>.
      </p>
      <div className="field">
        <label htmlFor="frontload-hours">Hours to frontload</label>
        <input
          id="frontload-hours"
          type="number"
          min="0"
          max={maximum}
          step="0.01"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setError('');
          }}
          autoFocus
        />
        <small className="field-help">
          Up to {fmt(maximum)}h can be frontloaded. Set this to 0 to remove the
          transfer.
        </small>
        {error && <span className="field-error">{error}</span>}
      </div>
      <div className="frontload-preview">
        <div>
          <span>This week</span>
          <b>
            {destination.weeklyAllowance == null
              ? 'Unlimited'
              : `${fmt(Math.max(0, destination.weeklyAllowance))}h usable`}
          </b>
        </div>
        <div>
          <span>Next week</span>
          <b>
            {nextSource.weeklyAllowance == null
              ? 'Unlimited'
              : `${fmt(Math.max(0, nextSource.weeklyAllowance))}h usable`}
          </b>
        </div>
      </div>
      {(currentLow || nextLow) && (
        <p className="frontload-low-warning" role="status">
          This project has {fmt(Math.max(0, warningHours))}h next week.
          Frontloading may make usable time too low.
        </p>
      )}
      {monthlyLimited && (
        <p className="help">
          Monthly allowance still limits this week to {fmt(destination.monthly)}
          h.
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        {existing > overage + EPSILON && (
          <button onClick={adjustToOverage}>
            Adjust to {fmt(overage)}h overage
          </button>
        )}
        {existing > 0 && (
          <button
            onClick={() => {
              setValue('0');
              setError('');
            }}
          >
            Remove frontloading
          </button>
        )}
        <button className="primary" onClick={submit}>
          {candidate === 0 && existing > 0
            ? 'Remove frontloading'
            : 'Save frontloading'}
        </button>
      </div>
    </Modal>
  );
}
