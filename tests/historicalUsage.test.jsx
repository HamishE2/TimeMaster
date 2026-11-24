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
  expect(screen.getByText('Step 1 of 3')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: /Contoso/ }));
  expect(screen.getByText('Step 1 of 5')).toBeTruthy();
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
  expect(screen.getByText('Step 4 of 5')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '← Back' }));
  expect(screen.getByText('Step 3 of 5')).toBeTruthy();
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
