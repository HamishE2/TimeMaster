import { describe, expect, it } from 'vitest';
import {
  NOT_COSTED,
  matchActivities,
  normaliseSplit,
  partQuantity,
  resolveEntryActivities,
  suggestSplit,
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

describe('entries covering several activities', () => {
  const list = [
    { id: 'qrg', name: 'Copilot Quick Reference Guide' },
    { id: 'ug', name: 'Copilot User Guide' },
    { id: 'fg', name: 'Training Facilitator and Demo Notes' },
    { id: 'cia', name: 'Change Impact and Readiness Assessment' },
    { id: 'sm', name: 'Stakeholder mapping' },
  ];
  const split = (note, hours, tag = null) =>
    resolveEntryActivities(note, list, tag, hours);
  const sum = (s) =>
    Math.round(Object.values(s).reduce((a, b) => a + b, 0) * 100) / 100;

  it.each([
    ['3 QRGs', 3],
    ['QRG x2', 2],
    ['x4 sessions', 4],
    ['two user guides', 2],
    ['a user guide', 1],
    ['user guide', 1],
  ])('reads the quantity in %s', (text, quantity) => {
    expect(partQuantity(text)).toBe(quantity);
  });

  it('splits hours across activities by quantity', () => {
    const result = split('3 QRGs and a user guide', 5);
    expect(result.status).toBe('match');
    expect(result.source).toBe('auto');
    expect(result.split).toEqual({ qrg: 3.75, ug: 1.25 });
  });

  it('accepts commas, ampersands and plus signs', () => {
    expect(split('QRGs x3, user guide', 5).split).toEqual({
      qrg: 3.75,
      ug: 1.25,
    });
    expect(split('CIA interviews & stakeholder mapping', 4).split).toEqual({
      cia: 2,
      sm: 2,
    });
    expect(sum(split('two user guides + 2 QRGs', 0.3).split)).toBe(0.3);
  });

  it('keeps activity names that contain "and" whole', () => {
    expect(split('facilitator and demo notes', 2).split).toEqual({ fg: 2 });
    expect(split('change impact and readiness assessment', 3).split).toEqual({
      cia: 3,
    });
  });

  it('ignores context-only parts but leaves vague parts uncosted', () => {
    expect(split('QRGs for finance and HR', 2).split).toEqual({ qrg: 2 });
    const partial = split('2 QRGs and admin', 3);
    expect(partial.status).toBe('partial');
    expect(partial.split).toEqual({ qrg: 2, [NOT_COSTED]: 1 });
  });

  it('always sums to the entry hours', () => {
    for (const hours of [0.01, 0.1, 0.25, 1, 1.3, 2.6, 7.6, 24])
      for (const note of ['3 QRGs and a user guide', 'qrg, user guide, CIA'])
        expect(sum(split(note, hours).split)).toBe(hours);
  });

  it('honours explicit tags and stored splits', () => {
    expect(split('QRGs', 2, 'ug').split).toEqual({ ug: 2 });
    expect(split('QRGs', 2, NOT_COSTED).split).toEqual({ [NOT_COSTED]: 2 });
    expect(split('anything', 5, { qrg: 3, ug: 2 })).toMatchObject({
      split: { qrg: 3, ug: 2 },
      source: 'tag',
    });
  });

  it('rescales a stored split when the hours change and moves deleted activities to uncosted', () => {
    expect(normaliseSplit({ qrg: 3, ug: 2 }, 6, list)).toEqual({
      qrg: 3.6,
      ug: 2.4,
    });
    expect(normaliseSplit({ qrg: 1, ug: 1, sm: 1 }, 1, list)).toEqual({
      qrg: 0.34,
      ug: 0.33,
      sm: 0.33,
    });
    expect(normaliseSplit({ qrg: 3, gone: 2 }, 5, list)).toEqual({
      qrg: 3,
      [NOT_COSTED]: 2,
    });
    expect(normaliseSplit({ qrg: 'x', ug: -1 }, 5, list)).toBeNull();
    expect(normaliseSplit({ qrg: 3 }, 0, list)).toBeNull();
    // An unusable stored split falls back to matching the note.
    expect(split('user guide', 2, { qrg: 'x' })).toMatchObject({
      split: { ug: 2 },
      source: 'auto',
    });
  });

  it('handles empty, zero and invalid hours', () => {
    expect(split('QRGs', 0).split).toEqual({});
    expect(split('QRGs', 'abc').split).toEqual({});
    expect(split('', 2)).toMatchObject({ split: {}, status: 'none' });
    expect(split('deliverables', 2)).toMatchObject({
      split: {},
      status: 'vague',
    });
    expect(suggestSplit(2, [])).toEqual({ [NOT_COSTED]: 2 });
  });

  it('describes each part for the split editor', () => {
    const { parts } = matchActivities('3 QRGs and a user guide', list);
    expect(parts.map((p) => [p.activityId, p.quantity])).toEqual([
      ['qrg', 3],
      ['ug', 1],
    ]);
  });
});

describe('manual costing picks', () => {
  const list = [
    { id: 'collateral', name: 'Collateral development' },
    { id: 'qrg', name: 'Quick reference guides' },
  ];
  it('lets a vague or unmatched note be charged to a chosen activity', () => {
    for (const note of ['meeting', 'int call', 'sync', ''])
      expect(
        resolveEntryActivities(note, list, 'collateral', 0.5),
      ).toMatchObject({
        split: { collateral: 0.5 },
        source: 'tag',
      });
  });
  it('a manual pick beats a confident match', () => {
    expect(resolveEntryActivities('QRGs', list, 'collateral', 1).split).toEqual(
      {
        collateral: 1,
      },
    );
  });
  it('without a pick, unmatched time is costed to the General bucket', () => {
    expect(resolveEntryActivities('int call', list, null, 0.5)).toMatchObject({
      split: { [NOT_COSTED]: 0.5 },
      source: 'default',
    });
  });
});
