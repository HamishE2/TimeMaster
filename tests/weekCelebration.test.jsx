import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import WeekCelebration from '../src/components/WeekCelebration.jsx';

const full = { capacity: 38, logged: 38, billable: 36 };
const partial = { capacity: 38, logged: 30, billable: 30 };

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const flush = () => act(() => vi.advanceTimersByTime(1));

test('celebrates only when an edit completes the week, once per week', () => {
  const view = render(<WeekCelebration week="2026-11-23" totals={partial} />);
  flush();
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<WeekCelebration week="2026-11-23" totals={full} />);
  flush();
  expect(screen.getByRole('status').textContent).toMatch(/Week logged/);
  act(() => vi.advanceTimersByTime(3300));
  expect(screen.queryByRole('status')).toBeNull();
  // Undo then redo does not repeat it.
  view.rerender(<WeekCelebration week="2026-11-23" totals={partial} />);
  view.rerender(<WeekCelebration week="2026-11-23" totals={full} />);
  flush();
  expect(screen.queryByRole('status')).toBeNull();
});

test('arriving on an already complete week stays quiet', () => {
  const view = render(<WeekCelebration week="2026-11-16" totals={full} />);
  flush();
  expect(screen.queryByRole('status')).toBeNull();
  view.rerender(<WeekCelebration week="2026-11-23" totals={partial} />);
  view.rerender(<WeekCelebration week="2026-11-30" totals={full} />);
  flush();
  expect(screen.queryByRole('status')).toBeNull();
});

test('below 80% billable does not celebrate', () => {
  const view = render(<WeekCelebration week="2026-12-07" totals={partial} />);
  view.rerender(
    <WeekCelebration
      week="2026-12-07"
      totals={{ capacity: 38, logged: 38, billable: 30 }}
    />,
  );
  flush();
  expect(screen.queryByRole('status')).toBeNull();
});
