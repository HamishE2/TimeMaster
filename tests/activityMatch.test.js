import { describe, expect, it } from 'vitest';
import {
  NOT_COSTED,
  matchActivity,
  normalise,
  resolveEntryActivity,
  stem,
} from '../src/lib/activityMatch.js';

const activities = [
  { id: 'qrg', name: 'Quick reference guides (QRGs)', amount: 4000 },
  { id: 'train', name: 'Training delivery', amount: 6000 },
  { id: 'fg', name: 'Facilitator guides', amount: 2000 },
  { id: 'comms', name: 'Communications', amount: 1500 },
  { id: 'cia', name: 'Change impact assessment', amount: 3000 },
];
const pick = (note, list = activities) => matchActivity(note, list);

describe('activity matching', () => {
  it('normalises and stems', () => {
    expect(normalise('  QRGs & Comms!! ')).toBe('qrgs and comms');
    expect(stem('guides')).toBe('guide');
    expect(stem('qrgs')).toBe('qrg');
    expect(stem('activities')).toBe('activity');
    expect(stem('process')).toBe('process');
  });

  it.each([
    ['QRGs', 'qrg'],
    ['qrg for finance', 'qrg'],
    ['Drafted quick reference guides for the finance team', 'qrg'],
    ['quik ref guides', 'qrg'],
    ['cheat sheets for Teams', 'qrg'],
    ['delivered training session', 'train'],
    ['facilitator notes', 'fg'],
    ['run sheet for workshop 2', 'fg'],
    ['CIA interviews', 'cia'],
    ['impact assessment', 'cia'],
    ['comms', 'comms'],
    ['wrote launch email', 'comms'],
  ])('matches %s', (note, id) => {
    const result = pick(note);
    expect(result.status).toBe('match');
    expect(result.activityId).toBe(id);
  });

  it('matches an activity named only by its acronym', () => {
    const list = [
      { id: 'q', name: 'QRGs' },
      { id: 't', name: 'Training' },
    ];
    expect(pick('quick reference guides', list).activityId).toBe('q');
    expect(pick('QRG', list).activityId).toBe('q');
  });

  it('uses activity aliases', () => {
    const list = [{ id: 'x', name: 'Phase 2 assets', aliases: ['posters'] }];
    expect(pick('printed posters', list).activityId).toBe('x');
  });

  it.each([
    'deliverables',
    'admin',
    'project work',
    'misc stuff',
    'Deliverables!',
  ])('treats %s as vague', (note) => {
    const result = pick(note);
    expect(result.status).toBe('vague');
    expect(result.activityId).toBeNull();
  });

  it('flags notes that fit two activities as ambiguous', () => {
    const list = [
      { id: 'a', name: 'Finance training' },
      { id: 'b', name: 'HR training' },
    ];
    const result = pick('training', list);
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map((c) => c.activityId).sort()).toEqual([
      'a',
      'b',
    ]);
  });

  it('returns none for unrelated notes and empty input', () => {
    expect(pick('lunch with partner firm').status).toBe('none');
    expect(pick('').status).toBe('none');
    expect(pick('QRGs', []).status).not.toBe('match');
    expect(pick(null, null).status).toBe('none');
  });

  it('prefers an existing tag, ignores stale tags and honours "not costed"', () => {
    expect(resolveEntryActivity('QRGs', activities, 'train')).toEqual({
      activityId: 'train',
      source: 'tag',
      status: 'match',
    });
    expect(resolveEntryActivity('QRGs', activities, 'deleted')).toEqual({
      activityId: 'qrg',
      source: 'auto',
      status: 'match',
    });
    expect(resolveEntryActivity('QRGs', activities, NOT_COSTED)).toEqual({
      activityId: null,
      source: 'tag',
      status: 'none',
    });
    expect(resolveEntryActivity('deliverables', activities, null).status).toBe(
      'vague',
    );
  });
});
