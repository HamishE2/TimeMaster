import { useState } from 'react';
import Modal from './Modal.jsx';
import { addablePhasesFor } from '../lib/taskLines.js';
import { hasPhases } from '../lib/tasks.js';

export default function ProjectLineModal({
  projects,
  week,
  initialProjectId,
  onClose,
  onAddTask,
  onAddProject,
  onManage,
}) {
  const eligible = projects.filter(
      (project) => !project.archived && project.status !== 'closed',
    ),
    [projectId, setProjectId] = useState(
      initialProjectId &&
        eligible.some((project) => project.id === initialProjectId)
        ? initialProjectId
        : eligible[0]?.id || '',
    ),
    project = eligible.find((item) => item.id === projectId),
    projectUsesPhases = hasPhases(project),
    tasks = project ? addablePhasesFor(project, week) : [],
    [taskId, setTaskId] = useState(tasks[0]?.id || ''),
    validTaskId = tasks.some((task) => task.id === taskId)
      ? taskId
      : tasks[0]?.id || '',
    isVisibleNow = project?.__visibleNow === true;
  return (
    <Modal title="Add line" onClose={onClose}>
      {eligible.length > 0 ? (
        <>
          <div className="field">
            <label htmlFor="line-project">Project</label>
            <select
              id="line-project"
              value={projectId}
              onChange={(event) => {
                const id = event.target.value;
                setProjectId(id);
                setTaskId('');
              }}
            >
              {eligible.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.__visibleNow ? '' : ' · not scheduled this week'}
                </option>
              ))}
            </select>
          </div>
          {tasks.length > 0 ? (
            <div className="field">
              <label htmlFor="line-task">Task / phase</label>
              <select
                id="line-task"
                value={validTaskId}
                onChange={(event) => setTaskId(event.target.value)}
              >
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.name}
                  </option>
                ))}
              </select>
            </div>
          ) : projectUsesPhases ? (
            <p className="help">
              All of this project's phases are already on this week's timesheet.
            </p>
          ) : (
            <p className="help">
              This project uses its General line. Add it to this week to start
              recording time.
            </p>
          )}
        </>
      ) : (
        <p className="help">
          No active projects are available. Add or restore a project in Projects
          first.
        </p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        {eligible.length === 0 ? (
          <button className="primary" onClick={onManage}>
            Manage projects
          </button>
        ) : tasks.length > 0 ? (
          <button
            className="primary"
            disabled={!projectId || !validTaskId}
            onClick={() => {
              onAddTask(projectId, validTaskId, week);
              onClose();
            }}
          >
            Add task line
          </button>
        ) : projectUsesPhases ? (
          <button className="primary" disabled>
            No phases left to add
          </button>
        ) : (
          <button
            className="primary"
            disabled={!projectId || isVisibleNow}
            onClick={() => {
              onAddProject(projectId, week);
              onClose();
            }}
          >
            {isVisibleNow ? 'Already on timesheet' : 'Add project'}
          </button>
        )}
      </div>
    </Modal>
  );
}
