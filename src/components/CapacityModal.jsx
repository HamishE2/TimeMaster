import {
  EPSILON,
  WEEKLY_RESOURCING_CAPACITY,
  fmt,
  projectMetrics,
} from '../lib/utils.js';
import Modal from './Modal.jsx';

export default function CapacityModal({
  projects,
  week,
  leaveWeeks,
  totals,
  onClose,
  onFillCapacity,
}) {
  const rows = projects
    .map((project) => ({
      project,
      metrics: projectMetrics(project, week, leaveWeeks),
    }))
    .filter(({ metrics }) => metrics.plan != null);
  return (
    <Modal title="Capacity breakdown" onClose={onClose} wide>
      <p className="help">
        Weekly resourcing target · {fmt(WEEKLY_RESOURCING_CAPACITY)}h
      </p>
      <div className="capacity-breakdown">
        <div className="capacity-breakdown-head">
          <span>Project</span>
          <span>Original</span>
          <span>Frontloading</span>
          <span>Effective</span>
        </div>
        {rows.length ? (
          rows.map(({ project, metrics }) => {
            const adjustment = metrics.frontloadedIn - metrics.frontloadedOut;
            return (
              <div className="capacity-breakdown-row" key={project.id}>
                <strong>{project.name}</strong>
                <span>{fmt(metrics.plan)}h</span>
                <span
                  className={
                    adjustment < 0
                      ? 'capacity-out'
                      : adjustment > 0
                        ? 'capacity-in'
                        : ''
                  }
                >
                  {adjustment === 0
                    ? '—'
                    : `${adjustment > 0 ? '+' : ''}${fmt(adjustment)}h`}
                </span>
                <b>{fmt(Math.max(0, metrics.weeklyAllowance))}h</b>
              </div>
            );
          })
        ) : (
          <p className="quiet">No projects have resourced hours this week.</p>
        )}
        <div className="capacity-breakdown-total">
          <span>Total resourced</span>
          <b>{fmt(totals.resourced)}h</b>
          <span>Capacity</span>
          <b
            className={
              totals.resourcingCapacity > 3 + EPSILON ? 'capacity-warning' : ''
            }
          >
            {fmt(totals.resourcingCapacity)}h
          </b>
        </div>
      </div>
      <div className="modal-actions">
        <button onClick={onClose}>Done</button>
        <button
          className="primary"
          disabled={totals.resourcingCapacity <= EPSILON}
          onClick={() => {
            if (onFillCapacity() !== false) onClose();
          }}
        >
          Fill capacity
        </button>
      </div>
    </Modal>
  );
}
