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

// Activity names in the style of the Transformation & Change catalogue.
const catalogue = [
  'Project Kick-off',
  'Change Discovery Workshop',
  'Change Impact and Readiness Assessment',
  'Persona and Scenario Identification Workshop',
  'Change Plan',
  'Communications Plan',
  'Training Plan',
  'Creative Assets Playbook',
  'Training Hub Design (SharePoint)',
  'Mandatory E-learning Module',
  'Copilot User Guide',
  'Copilot Quick Reference Guide',
  'Day-in-the-life Guide',
  'Short Learning Video (up to 60 seconds)',
  'Copilot 101 Training Session x1',
  'Training Facilitator and Demo Notes',
  'Prompting Masterclass (45 minutes)',
  'Train-the-Trainer Pack and x1 Session',
  'Copilot Drop-in Session (30 minutes)',
  'Community of Practice / Centre of Excellence Setup',
  'Champion Toolkit',
  'Weekly Champion / Community Copilot Tip',
  'Virtual Copilot Escape Room',
  'Training Survey (Pre and Post)',
  'Copilot Dashboard Analysis',
  'Two-month Lite Hypercare',
  'Project Governance',
  'Consulting QA',
].map((name) => ({ id: name, name }));

describe('matching against a real-world activity catalogue', () => {
  it.each([
    ['QRGs', 'Copilot Quick Reference Guide'],
    ['drafted quick reference guides', 'Copilot Quick Reference Guide'],
    ['facilitator notes for session 2', 'Training Facilitator and Demo Notes'],
    ['CIA interviews', 'Change Impact and Readiness Assessment'],
    ['drop-ins', 'Copilot Drop-in Session (30 minutes)'],
    ['ran 2 drop in sessions', 'Copilot Drop-in Session (30 minutes)'],
    ['escape room build', 'Virtual Copilot Escape Room'],
    ['TTT pack', 'Train-the-Trainer Pack and x1 Session'],
    ['CoP setup', 'Community of Practice / Centre of Excellence Setup'],
    ['elearning module', 'Mandatory E-learning Module'],
    ['weekly tip', 'Weekly Champion / Community Copilot Tip'],
    ['masterclass', 'Prompting Masterclass (45 minutes)'],
    ['user guide', 'Copilot User Guide'],
    ['DITL guide', 'Day-in-the-life Guide'],
    ['status meeting', 'Project Governance'],
    ['kickoff', 'Project Kick-off'],
    ['peer review QA', 'Consulting QA'],
  ])('%s → %s', (note, expected) => {
    const result = matchActivity(note, catalogue);
    expect(result.status).toBe('match');
    expect(result.activityId).toBe(expected);
  });

  it('asks when a note fits several catalogue activities', () => {
    expect(matchActivity('training', catalogue).status).toBe('ambiguous');
    expect(matchActivity('deliverables', catalogue).status).toBe('vague');
  });
});
