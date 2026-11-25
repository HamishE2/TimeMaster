import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import HistoricalUsageForm from '../src/components/HistoricalUsageForm.jsx';

afterEach(cleanup);

const project = {
  id: 'p',
  name: 'Contoso',
  client: 'Contoso',
  budget: 10000,
  tasks: [
    { id: 'general', name: 'General' },
    { id: 'train', name: 'Training' },
  ],
  activities: [{ id: 'qrg', name: 'QRGs', amount: 2000 }],
  entries: {},
  taskEntries: {},
};
const other = { id: 'o', name: 'Plain', tasks: [], entries: {} };

const next = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Next →' }));

test('walks the steps with Next and Back and saves the breakdown', () => {
  const onSave = vi.fn();
  render(
    <HistoricalUsageForm
      projects={[other, project]}
      settings={{ hourlyRate: 100 }}
      week="2026-11-23"
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  expect(screen.getByText('Step 1 of 4')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Contoso/ }));
  expect(screen.getByText('Step 1 of 6')).toBeTruthy();
  next();
  // Your own work is the default.
  expect(screen.getByRole('radio', { name: /Mine/ }).getAttribute('aria-checked')).toBe('true');
  next();
  // An empty total stops on the step with an error.
  next();
  expect(screen.getByRole('alert').textContent).toMatch(/hours used/);
  fireEvent.change(screen.getByLabelText('Total hours'), {
    target: { value: '10' },
  });
  next();
  fireEvent.change(screen.getByLabelText('Training'), {
    target: { value: '4' },
  });
  expect(screen.getByText('6h')).toBeTruthy();
  next();
  fireEvent.change(screen.getByLabelText('QRGs'), { target: { value: '12' } });
  expect(screen.getByRole('alert').textContent).toMatch(/2h more/);
  next();
  expect(screen.getByText('Step 5 of 6')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '← Back' }));
  expect(screen.getByText('Step 4 of 6')).toBeTruthy();
  next();
  fireEvent.change(screen.getByLabelText('QRGs'), { target: { value: '3' } });
  next();
  expect(screen.getByText(/Adds/).textContent).toMatch(/\$1,000/);
  fireEvent.click(screen.getByRole('button', { name: 'Add usage' }));
  expect(onSave).toHaveBeenCalledTimes(1);
  const [projectId, record] = onSave.mock.calls[0];
  expect(projectId).toBe('p');
  expect(record).toMatchObject({
    unit: 'hours',
    total: 10,
    phases: { train: 4, general: 6 },
    activities: { qrg: 3, none: 7 },
  });
});

test('other people’s hours can be costed at a level, and Save and add starts your own', () => {
  const onSave = vi.fn();
  render(
    <HistoricalUsageForm
      projects={[project]}
      settings={{
        hourlyRate: 100,
        rateLevels: [{ id: 'cert', name: 'Certified', rate: 200 }],
      }}
      week="2026-11-23"
      projectId="p"
      onSave={onSave}
      onClose={() => {}}
    />,
  );
  // Pills jump straight to a step; Check can't finish until every step is opened.
  fireEvent.click(screen.getByRole('button', { name: /^Check, not opened yet/ }));
  expect(screen.getByText('Step 6 of 6')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add usage' }).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /^Whose work, not opened yet/ }));
  fireEvent.click(screen.getByRole('radio', { name: /Other people/ }));
  next();
  fireEvent.change(screen.getByLabelText('Total hours'), {
    target: { value: '5' },
  });
  fireEvent.click(screen.getByRole('radio', { name: /Certified/ }));
  expect(screen.getByText(/at \$200(\.00)?\/h/).textContent).toMatch(/\$1,000/);
  next();
  next();
  next();
  expect(screen.getByRole('button', { name: 'Add usage' }).disabled).toBe(false);
  fireEvent.click(
    screen.getByRole('button', { name: 'Save and add my own usage' }),
  );
  const [, record, options] = onSave.mock.calls[0];
  expect(record).toMatchObject({ who: 'others', levelId: 'cert', total: 5 });
  expect(options).toEqual({ addOther: 'me' });
});
