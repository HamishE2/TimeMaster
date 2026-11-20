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
import AllocationMeter from './AllocationMeter.jsx';
import { WEEKLY_RESOURCING_CAPACITY } from '../lib/utils.js';
import Modal from './Modal.jsx';

export default function FrontloadModal({
  totals,
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
      frontloads: {
        ...(project.frontloads || {}),
        [week]: valid ? candidate : existing,
      },
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
  const rows = [
    ['This week', week, destination],
    ['Next week', next, nextSource],
  ];
  const hours = (n) => (n == null ? 'Unlimited' : fmt(n) + 'h');
  const resourced =
    totals.resourced +
    (destination.weeklyAvailable || 0) -
    (metrics.weeklyAvailable || 0);
  const columns = (m) => [
    m.plan,
    m.frontloadedIn - m.frontloadedOut,
    m.weeklyAvailable,
    m.logged,
  ];
  const sums = columns(destination).map((n, i) =>
    n == null || columns(nextSource)[i] == null
      ? null
      : n + columns(nextSource)[i],
  );
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
      <div className="transfer-body">
        <p className="transfer-project">
          {project.name}
          {project.client && <small>{project.client}</small>}
        </p>
        <div className="transfer-weeks">
          {rows.map(([label, date, m], i) => (
            <div className="transfer-week" key={label}>
              <b>{label}</b>
              <small>{weekLabel(date)}</small>
              <strong>
                {hours(m.weeklyAvailable)} <small>usable</small>
              </strong>
              <AllocationMeter
                label="Logged"
                used={m.logged}
                allocation={i ? m.plan : m.weeklyAllowance}
                frontloadedUsage={i ? m.frontloadedOut : 0}
                nativeAllocation={Math.max(0, m.plan - m.frontloadedOut)}
                frontloaded={i ? 0 : m.frontloadedIn}
              />
              {!i && (
                <span className="transfer-arrow">
                  ← {fmt(valid ? candidate : existing)}h
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="field">
          <label htmlFor="frontload-hours">Hours to frontload</label>
          <input
            aria-label="Adjust transfer hours"
            type="range"
            min="0"
            max={maximum}
            step="0.01"
            value={valid ? candidate : existing}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
          />
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
            Up to {fmt(maximum)}h can be frontloaded. Set this to 0 to remove
            the transfer.
          </small>
          {error && <span className="field-error">{error}</span>}
        </div>
        {(currentLow || nextLow) && (
          <p className="frontload-low-warning" role="status">
            This project has {fmt(Math.max(0, warningHours))}h next week.
            Frontloading may make usable time too low.
          </p>
        )}
        {monthlyLimited && (
          <p className="help">
            Monthly allowance still limits this week to{' '}
            {fmt(destination.monthly)}
            h.
          </p>
        )}
        <h3>After saving</h3>
        <div className="transfer-scroll">
          <table>
            <thead>
              <tr>
                {['Week', 'Plan', 'Moved', 'Usable', 'Logged'].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, , m]) => (
                <tr key={label}>
                  <th>{label}</th>
                  {columns(m).map((n, i) => (
                    <td key={i}>
                      {i === 1 && n > 0 ? '+' : ''}
                      {hours(n)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Two-week total</th>
                {sums.map((n, i) => (
                  <td key={i}>{hours(n)}</td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        <h3>Capacity this week</h3>
        <div className="transfer-summary">
          {[
            ['Resourced', resourced],
            ['Logged', totals.logged],
            [
              resourced > WEEKLY_RESOURCING_CAPACITY
                ? 'Over capacity'
                : 'Unresourced',
              Math.abs(WEEKLY_RESOURCING_CAPACITY - resourced),
            ],
          ].map(([label, n]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{hours(n)}</b>
            </div>
          ))}
        </div>
      </div>
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
