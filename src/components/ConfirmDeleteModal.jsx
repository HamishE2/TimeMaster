import { useEffect } from 'react';
import ModalBackdrop from './ModalBackdrop.jsx';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  project,
  onDeleteThisWeek,
  onDeleteThisWeekOnwards,
  onDeleteNextWeekOnwards,
  onDeleteAllWeeks,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !project) return null;

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div className="modal-header">
          <h2>Remove project</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <p style={{ marginBottom: '12px' }}>
            You are about to delete the project <strong>{project.name}</strong>.
          </p>
          <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
            Choose how you want to remove this project:
          </p>

          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            <button
              className="delete-option-btn option-this-week"
              onClick={() => {
                onDeleteThisWeek();
                onClose();
              }}
            >
              <strong style={{ color: 'var(--brand-light)', fontSize: '14px' }}>
                This Week Only
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                Hide from the current week's view. Past and future weeks remain
                unaffected.
              </span>
            </button>

            <button
              className="delete-option-btn"
              onClick={() => {
                onDeleteThisWeekOnwards();
                onClose();
              }}
            >
              <strong style={{ color: 'var(--purple)', fontSize: '14px' }}>
                This Week Onwards
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                Hide from the current week and all future weeks. Past weeks are
                kept.
              </span>
            </button>

            <button
              className="delete-option-btn"
              onClick={() => {
                onDeleteNextWeekOnwards();
                onClose();
              }}
            >
              <strong style={{ color: 'var(--orange)', fontSize: '14px' }}>
                Next Week Onwards
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                Keep in the current week, but hide from next week and all future
                weeks.
              </span>
            </button>

            <button
              className="delete-option-btn option-all-weeks"
              onClick={() => {
                onDeleteAllWeeks();
                onClose();
              }}
            >
              <strong style={{ color: 'var(--light-red)', fontSize: '14px' }}>
                All Weeks (Permanently)
              </strong>
              <span
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                Completely delete the project and all its historical logged
                hours.
              </span>
            </button>
          </div>
        </div>

        <div className="modal-footer" style={{ padding: '16px 24px' }}>
          <button
            className="btn btn-ghost"
            onClick={onClose}
            style={{ width: '100%' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
