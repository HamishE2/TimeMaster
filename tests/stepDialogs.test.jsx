import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import ProjectModal from '../src/components/ProjectModal.jsx';
import FrontloadModal from '../src/components/FrontloadModal.jsx';
import ProjectLineModal from '../src/components/ProjectLineModal.jsx';
import ImportModal from '../src/components/ImportModal.jsx';

afterEach(cleanup);

const WEEK = '2026-11-23';
const next = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
const stepIs = (n, of) =>
  expect(screen.getByText(`Step ${n} of ${of}`)).toBeTruthy();

test('the project editor walks seven steps and requires every phase budget', () => {
  const onSave = vi.fn();
  render(
    <ProjectModal
      isOpen
      onClose={() => {}}
      onSave={onSave}
      initial={null}
      projects={[]}
      weekKey={WEEK}
      hourlyRate={100}
    />,
  );
  stepIs(1, 7);
  // A name is needed before moving on.
  next();
  expect(screen.getByRole('alert').textContent).toMatch(/name/i);
  fireEvent.change(screen.getByLabelText('Project name'), {
    target: { value: 'Intranet' },
  });
  next();
  stepIs(2, 7);
  next();
  fireEvent.change(screen.getByLabelText('Hours a week'), {
    target: { value: '6' },
  });
  next();
  stepIs(4, 7);
  const add = screen.getByLabelText('Add a phase');
  fireEvent.change(add, { target: { value: 'Discovery' } });
  fireEvent.keyDown(add, { key: 'Enter' });
  expect(screen.getByRole('checkbox', { name: /Discovery/ })).toBeTruthy();
  next();
  stepIs(5, 7);
  fireEvent.change(screen.getByLabelText('Total budget'), {
    target: { value: '10000' },
  });
  next();
  // Discovery's budget is required once there is a total.
  expect(screen.getByRole('alert').textContent).toMatch(/Discovery/);
  fireEvent.change(screen.getByLabelText('Discovery budget'), {
    target: { value: '4000' },
  });
  expect(screen.getByText('General budget').nextSibling.textContent).toBe(
    '$6,000',
  );
  next();
  stepIs(6, 7);
  next();
  stepIs(7, 7);
  fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  const args = onSave.mock.calls[0];
  expect(args[0]).toBe('Intranet');
  expect(args[1]).toBe(6);
  expect(args[11].map((task) => task.name)).toEqual(['General', 'Discovery']);
  const discovery = args[11][1].id;
  expect(args[16]).toMatchObject({
    budget: 10000,
    phaseBudgets: { [discovery]: 4000 },
  });
});

test('Edit budget opens the project editor on the Budget step', () => {
  render(
    <ProjectModal
      isOpen
      focusPhase="__budget"
      onClose={() => {}}
      onSave={() => {}}
      initial={{
        id: 'p',
        name: 'Audit',
        resourcedHours: 4,
        tasks: [{ id: 'general', name: 'General' }],
      }}
      weekKey={WEEK}
    />,
  );
  stepIs(5, 7);
  expect(screen.getByRole('heading', { name: 'Audit' })).toBeTruthy();
});

test('frontloading picks a quick amount and checks before saving', () => {
  const onSave = vi.fn(() => true);
  const onClose = vi.fn();
  render(
    <FrontloadModal
      totals={{ resourced: 16, logged: 2 }}
      project={{
        id: 'p',
        name: 'Contoso',
        resourcedHours: 6,
        entries: {},
        weeklyOverrides: {},
        frontloads: {},
        hiddenWeeks: [],
      }}
      week={WEEK}
      leaveWeeks={{}}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  expect(
    screen.getByRole('heading', { name: 'Frontload hours · Contoso' }),
  ).toBeTruthy();
  next();
  expect(screen.getByRole('alert').textContent).toMatch(/Choose/);
  fireEvent.click(screen.getByRole('radio', { name: /^4h/ }));
  next();
  expect(screen.getByText('This week').nextSibling.textContent).toBe(
    '6h → 10h',
  );
  expect(screen.getByText('Next week').nextSibling.textContent).toBe('6h → 2h');
  fireEvent.click(screen.getByRole('button', { name: 'Save frontloading' }));
  expect(onSave).toHaveBeenCalledWith(4);
  expect(onClose).toHaveBeenCalled();
});

test('adding a line can create a new phase', () => {
  const onAddPhase = vi.fn(() => ({ taskId: 'x' }));
  const onAddTask = vi.fn();
  render(
    <ProjectLineModal
      projects={[
        {
          id: 'p',
          name: 'Contoso',
          tasks: [
            { id: 'general', name: 'General' },
            { id: 'train', name: 'Training' },
          ],
          taskRows: {},
          __visibleNow: true,
        },
      ]}
      week={WEEK}
      initialProjectId="p"
      onClose={() => {}}
      onAddTask={onAddTask}
      onAddProject={() => {}}
      onAddPhase={onAddPhase}
    />,
  );
  // Opened from a project, so it starts on the Phase step.
  stepIs(2, 2);
  expect(screen.getByRole('radio', { name: /General/ }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: '+ New phase' }));
  fireEvent.change(screen.getByLabelText('New phase name'), {
    target: { value: 'Hypercare' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add line' }));
  expect(onAddPhase).toHaveBeenCalledWith('p', 'Hypercare', WEEK);
  expect(onAddTask).not.toHaveBeenCalled();
});

test('importing a CSV picks projects and shows the counts', async () => {
  const onImport = vi.fn();
  render(
    <ImportModal
      onClose={() => {}}
      existingProjects={[{ id: 'a', name: 'Alpha', resourcedHours: 5 }]}
      onImport={onImport}
    />,
  );
  expect(screen.getByRole('button', { name: 'Next →' }).disabled).toBe(true);
  const csv =
    'Project Name,23 Nov M,24 Nov T,25 Nov W,26 Nov T,27 Nov F\nAlpha,2,2,2,1,1\nBeta,1,1,1,1,0';
  const input = document.querySelector('input[type="file"]');
  fireEvent.change(input, {
    target: { files: [new File([csv], 'plan.csv', { type: 'text/csv' })] },
  });
  await waitFor(() =>
    expect(document.querySelector('.cfg-drop').textContent).toMatch(
      /plan\.csv · 2 projects found · resourcing sheet/,
    ),
  );
  next();
  expect(screen.getByRole('checkbox', { name: /Alpha/ }).textContent).toMatch(
    /5h → 8h resourced.*Updates existing/,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /Beta/ }));
  next();
  expect(screen.getByText('Updated projects').nextSibling.textContent).toBe(
    '1 · Alpha',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Import 1 project' }));
  expect(onImport).toHaveBeenCalledTimes(1);
  expect(onImport.mock.calls[0][1].map((item) => item.name)).toEqual(['Alpha']);
});
