import { describe, expect, it } from 'vitest';
import {
  placeProjectRecord,
  placeTaskRecord,
} from '../src/lib/projectOperations.js';
import { taskLinesFor } from '../src/lib/taskLines.js';
import { phaseHours } from '../src/lib/tasks.js';

const ws = (ids) => ({ projects: ids.map((id) => ({ id })) });
const ids = (w) => w.projects.map((p) => p.id).join('');

describe('placeProjectRecord', () => {
  it('moves before a target, skipping hidden projects in between', () => {
    // b is hidden from the timesheet; dragging d above c must not swap with b.
    expect(ids(placeProjectRecord(ws(['a', 'b', 'c', 'd']), 'd', 'c'))).toBe(
      'abdc',
    );
  });
  it('moves after a target, including to the end', () => {
    expect(ids(placeProjectRecord(ws(['a', 'b', 'c']), 'a', 'c', true))).toBe(
      'bca',
    );
  });
  it('ignores unknown or identical ids', () => {
    const w = ws(['a', 'b']);
    expect(placeProjectRecord(w, 'a', 'a')).toBe(w);
    expect(placeProjectRecord(w, 'x', 'a')).toBe(w);
    expect(placeProjectRecord(w, 'a', 'x')).toBe(w);
  });
});

describe('placeTaskRecord', () => {
  const project = {
    id: 'p',
    tasks: [{ id: 'general' }, { id: 'a' }, { id: 'b' }, { id: 'c' }],
  };
  const order = (w) => w.projects[0].tasks.map((t) => t.id).join(',');
  it('moves a phase before or after another', () => {
    const w = { projects: [project] };
    expect(order(placeTaskRecord(w, 'p', 'c', 'a'))).toBe('general,c,a,b');
    expect(order(placeTaskRecord(w, 'p', 'a', 'c', true))).toBe(
      'general,b,c,a',
    );
  });
  it('leaves other projects and unknown ids alone', () => {
    const other = { id: 'q', tasks: [{ id: 'x' }] };
    const w = { projects: [project, other] };
    const next = placeTaskRecord(w, 'p', 'a', 'zzz');
    expect(next.projects[0]).toBe(project);
    expect(placeTaskRecord(w, 'p', 'c', 'a').projects[1]).toBe(other);
  });
});

describe('taskLinesFor', () => {
  it('follows phase order rather than alphabetical order', () => {
    const p = {
      tasks: [
        { id: 'general', name: 'General' },
        { id: 'z', name: 'Zeta' },
        { id: 'a', name: 'Alpha' },
      ],
      taskRows: { '2026-11-16': ['z', 'a'] },
    };
    expect(taskLinesFor(p, '2026-11-16').map((t) => t.id)).toEqual(['z', 'a']);
  });
});

describe('phaseHours', () => {
  it('totals General from entries and phases from taskEntries', () => {
    const p = {
      entries: { w1: { 0: 2, 1: 1.5 }, w2: { 3: 1 } },
      taskEntries: { build: { w1: { 0: 3 }, w2: { 1: '0.5' } } },
    };
    expect(phaseHours(p, 'general')).toBe(4.5);
    expect(phaseHours(p, 'build')).toBe(3.5);
    expect(phaseHours(p, 'none')).toBe(0);
    expect(phaseHours(null, 'build')).toBe(0);
  });
});
