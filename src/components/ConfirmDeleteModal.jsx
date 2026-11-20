import { useState, useEffect } from 'react';
import ModalBackdrop from './ModalBackdrop.jsx';
import ScopePicker from './ScopePicker.jsx';

export default function ConfirmDeleteModal({
  isOpen,
  onClose,
  project,
  onDeleteThisWeek,
  onDeleteThisWeekOnwards,
  onDeleteNextWeekOnwards,
  onDeleteAllWeeks,
}) {
  // App remounts this dialog per project (key={project.id}), so the choice resets.
  const [scope, setScope] = useState(null);
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !project) return null;

  const actions = {
    week: ['Hide this week', onDeleteThisWeek],
    onwards: ['Hide from this week on', onDeleteThisWeekOnwards],
    'next-onwards': ['Hide from next week on', onDeleteNextWeekOnwards],
    project: ['Delete permanently', onDeleteAllWeeks],
  };
  const options = [
    ['week', 'This week only'],
    ['onwards', 'This week onwards'],
    ['next-onwards', 'Next week onwards'],
    ['project', 'All weeks · deletes logged time', null, true],
  ];
  const choice = actions[scope];

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal confirm-dialog" role="dialog" aria-labelledby="remove-project-title">
        <div className="confirm-body">
          <h2 id="remove-project-title">Remove {project.name}</h2>
          <ScopePicker
            options={options}
            value={scope}
            onChange={setScope}
            removing
            label="Weeks to remove from"
          />
        </div>
        <div className="confirm-foot">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={!choice}
            className={scope === 'project' ? 'danger-solid' : 'danger-outline'}
            onClick={() => {
              choice[1]();
              onClose();
            }}
          >
            {choice?.[0] || 'Choose weeks'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
