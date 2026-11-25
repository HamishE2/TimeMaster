import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import Settings from '../src/components/Settings.jsx';

afterEach(cleanup);

test('rate levels start empty, and picking your role fills the hourly rate', () => {
  const onSave = vi.fn();
  render(
    <Settings
      settings={{ hourlyRate: 150, theme: 'system' }}
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  expect(screen.getByText(/No levels yet/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: '+ Add level' }));
  fireEvent.change(screen.getByLabelText('Level 1 name'), {
    target: { value: 'Certified' },
  });
  fireEvent.change(screen.getByLabelText('Certified hourly rate'), {
    target: { value: '220' },
  });
  fireEvent.change(screen.getByLabelText('Your role'), {
    target: { value: screen.getByRole('option', { name: 'Certified' }).value },
  });
  expect(screen.getByLabelText('Hourly rate').value).toBe('220');
  // The rate stays editable.
  fireEvent.change(screen.getByLabelText('Hourly rate'), {
    target: { value: '240' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  const saved = onSave.mock.calls[0][0];
  expect(saved.hourlyRate).toBe(240);
  expect(saved.rateLevels).toEqual([
    { id: saved.roleLevelId, name: 'Certified', rate: 220 },
  ]);
});
