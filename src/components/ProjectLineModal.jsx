import { useState } from 'react';
import { addablePhasesFor } from '../lib/taskLines.js';
import { phasesOf } from '../lib/tasks.js';
import { weekLabel } from '../lib/utils.js';
import { BigField, ChoiceGroup, StepDialog, StepSection } from './StepForm.jsx';

// "Add a line": pick a project, then the line to add to this week. Lines
// already on the week are shown but can't be picked; "+ New phase" adds a
// phase to the project and pins it in one go.
export default function ProjectLineModal({
  projects,
  week,
  initialProjectId,
  onClose,
  onAddTask,
  onAddProject,
  onAddPhase,
  onManage,
}) {
  const eligible = projects.filter(
    (project) => !project.archived && project.status !== 'closed',
  );
  const [projectId, setProjectId] = useState(
    initialProjectId && eligible.some((p) => p.id === initialProjectId)
      ? initialProjectId
      : eligible[0]?.id || '',
  );
  const [step, setStep] = useState(
    initialProjectId && projectId === initialProjectId ? 1 : 0,
  );
  const project = eligible.find((item) => item.id === projectId);
  const addable = new Set(
    project ? addablePhasesFor(project, week).map((task) => task.id) : [],
  );
  const generalOn = project?.__visibleNow === true;
  const firstFree = (item) => {
    const free = item ? addablePhasesFor(item, week) : [];
    if (free.length) return free[0].id;
    return item && !item.__visibleNow ? 'general' : 'new';
  };
  const [line, setLine] = useState(() => firstFree(project));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const options = project
    ? [
        {
          value: 'general',
          label: 'General',
          sub: generalOn ? 'Already on this week' : undefined,
          disabled: generalOn,
        },
        ...phasesOf(project).map((task) => ({
          value: task.id,
          label: task.name,
          sub: addable.has(task.id) ? undefined : 'Already on this week',
          disabled: !addable.has(task.id),
        })),
        { value: 'new', label: '+ New phase' },
      ]
    : [];

  if (!eligible.length)
    return (
      <StepDialog
        title="Add a line"
        steps={['Project']}
        index={0}
        onNext={onManage}
        onClose={onClose}
        finishLabel="Manage projects"
      >
        <StepSection title="Every project is archived or closed." />
      </StepDialog>
    );

  const next = () => {
    if (step === 0) return setStep(1);
    if (line === 'general') onAddProject(projectId, week);
    else if (line === 'new') {
      const result = onAddPhase(projectId, name, week);
      if (result?.error) return setError(result.error);
    } else onAddTask(projectId, line, week);
    onClose();
  };

  return (
    <StepDialog
      title={`Add a line · ${weekLabel(week)}`}
      steps={['Project', 'Phase']}
      index={step}
      onBack={() => setStep(0)}
      onNext={next}
      onClose={onClose}
      finishLabel="Add line"
      nextDisabled={!project || (step === 1 && !line)}
    >
      {step === 0 && (
        <StepSection title="Which project?">
          <ChoiceGroup
            ariaLabel="Project"
            cols={3}
            value={projectId}
            onChange={(id) => {
              setProjectId(id);
              setLine(firstFree(eligible.find((item) => item.id === id)));
              setError('');
            }}
            options={eligible.map((item) => ({
              value: item.id,
              label: item.name,
              sub: item.client || 'No client',
              color: item.color || 'var(--muted)',
            }))}
          />
        </StepSection>
      )}
      {step === 1 && project && (
        <StepSection title={`Which phase of ${project.name}?`}>
          <ChoiceGroup
            ariaLabel="Phase"
            cols={3}
            value={line}
            onChange={(value) => {
              setLine(value);
              setError('');
            }}
            options={options}
          />
          {line === 'new' && (
            <BigField
              id="line-new-phase"
              label="New phase name"
              placeholder="e.g. Hypercare"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError('');
              }}
              hint="Added to the project and pinned to this week"
              error={error || undefined}
              autoFocus
            />
          )}
        </StepSection>
      )}
    </StepDialog>
  );
}
