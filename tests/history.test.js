import { describe, expect, it } from 'vitest';
import { reducer } from '../src/lib/useHistory.js';

const start = { past: [], present: 0, future: [], lastAt: 0 };
const set = (state, update, at) => reducer(state, { type: 'set', update, at });

describe('undo history', () => {
  it('undoes and redoes separate edits', () => {
    let s = set(start, 1, 1000);
    s = set(s, (n) => n + 1, 5000);
    expect(s.present).toBe(2);
    s = reducer(s, { type: 'undo' });
    expect(s.present).toBe(1);
    s = reducer(s, { type: 'redo' });
    expect(s.present).toBe(2);
  });

  it('merges rapid edits into one step', () => {
    let s = set(start, 1, 1000);
    s = set(s, 2, 1200);
    s = set(s, 3, 1400);
    s = reducer(s, { type: 'undo' });
    expect(s.present).toBe(0);
  });

  it('clears redo after a new edit and ignores reset history', () => {
    let s = set(start, 1, 1000);
    s = reducer(s, { type: 'undo' });
    s = set(s, 5, 9000);
    expect(s.future).toEqual([]);
    s = reducer(s, { type: 'reset', value: 9 });
    expect(reducer(s, { type: 'undo' }).present).toBe(9);
  });
});
