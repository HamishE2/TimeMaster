import { useState } from 'react';
import {
  BUDGET_NEAR,
  attentionItems,
  formatDays,
  formatMoney,
  formatPercent,
} from '../lib/budget.js';
import CheckIcon from './CheckIcon.jsx';
import { projectworksMenuItem } from './projectMenu.js';
import RowMenu from './RowMenu.jsx';

const whole = (value) => formatMoney(value, { whole: true });
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One headline for the card, from the worst thing on it.
function headline(item, attention) {
  if (!item.hasRate) return { tone: 'neutral', label: 'No rate' };
  const count = (kind, tone) =>
    attention.filter((a) => a.kind === kind && a.tone === tone).length;
  const budget = attention.find((a) => a.kind === 'budget');
  for (const tone of ['red', 'amber']) {
    const word = tone === 'red' ? 'over' : 'near limit';
    if (count('costing', tone))
      return {
        tone,
        label: `${plural(count('costing', tone), 'deliverable')} ${word}`,
      };
    if (budget?.tone === tone)
      return {
        tone,
        label: budget.reason === 'plan' ? 'Plan over budget' : 'Budget low',
      };
    if (count('phase', tone))
      return {
        tone,
        label: `${plural(count('phase', tone), 'phase')} ${word}`,
      };
  }
  if (!item.hasBudget && !item.activities.some((a) => a.amount != null))
    return { tone: 'neutral', label: 'No budget' };
  return { tone: 'green', label: 'On track' };
}

const GLYPHS = {
  neutral: '–',
  green: <CheckIcon size={10} />,
  amber: '!',
  red: '×',
};

function Chip({ tone, label }) {
  return (
    <span className={`fin-chip tone-${tone}`}>
      <i aria-hidden="true">{GLYPHS[tone]}</i>
      {label}
    </span>
  );
}

const pctOf = (part, total) =>
  total > 0 ? Math.min(100, Math.max(0, (part / total) * 100)) : 0;

// Your usage against an amount: a filled bar and, once over, the part past
// the amount hatched.
function UsageBar({ spent, amount }) {
  if (amount == null) return null;
  const over = spent > amount,
    within = over
      ? pctOf(amount, spent)
      : amount > 0
        ? pctOf(spent, amount)
        : 0;
  return (
    <span className="fin-bar" aria-hidden="true">
      <i style={{ width: `${within}%` }} />
      {over && <i className="is-past" style={{ width: `${100 - within}%` }} />}
    </span>
  );
}

// A deliverable (costing): your usage in bold, or how far over, a bar, then
// days · costed amount · percent. Never what is left.
function DeliverableRow({ row, level, hasRate }) {
  const over = hasRate && row.amount != null && row.spent > row.amount;
  return (
    <li
      className={`fin-lead-row tone-${row.status.tone}${over ? ' is-over' : ''}`}
    >
      <span className="fin-lead-head">
        <span className="fin-lead-name">
          {row.name}
          {level && <span className="fin-level">{level}</span>}
        </span>
        <b className={`fin-lead-left fin-num${over ? ' over-text' : ''}`}>
          {!hasRate
            ? '—'
            : over
              ? `${whole(row.spent - row.amount)} over`
              : `${whole(row.spent)} used`}
        </b>
      </span>
      {hasRate && <UsageBar spent={row.spent} amount={row.amount} />}
      <small className="fin-num">
        <b>{formatDays(row.days)}</b>
        {' · '}
        {row.amount == null
          ? 'No amount set'
          : [
              over && `${whole(row.spent)} used`,
              `${whole(row.amount)} costed`,
              hasRate ? formatPercent(row.pct) : 'no rate',
            ]
              .filter(Boolean)
              .join(' · ')}
      </small>
    </li>
  );
}

// A phase: its share of your own time on the project, in days and dollars.
function PhaseRow({ phase, total, hasRate }) {
  return (
    <li className="fin-phase-row">
      <span className="fin-phase-name">{phase.name}</span>
      <span className="fin-bar is-thin" aria-hidden="true">
        <i style={{ width: `${pctOf(phase.days, total)}%` }} />
      </span>
      <span className="fin-num fin-phase-of">
        <b>{formatDays(phase.days)}</b>
        {hasRate && ` · ${whole(phase.spent)}`}
      </span>
    </li>
  );
}

// One project's Money card, built only from your own time: deliverables
// first, then your time by phase, then what you have used of the project
// budget.
export default function FinancialsCard({
  item,
  project,
  levelName = () => null,
  onEditProject,
  onAddLink,
  onEditBudget,
  onAddHistory,
  onEditHistory,
  onRemoveHistory,
}) {
  const [menu, setMenu] = useState(null);
  const attention = attentionItems(item);
  const head = headline(item, attention);
  const costings = item.activities.filter((a) => a.amount != null);
  const hasPhases = item.phases.length > 1;
  const sum = (list, key) =>
    list.reduce((n, row) => n + Math.round((row[key] || 0) * 100), 0) / 100;
  const budgetTone =
    !item.hasRate || item.pct == null
      ? 'tone-neutral'
      : item.spent > item.budget
        ? 'tone-red'
        : item.pct >= BUDGET_NEAR
          ? 'tone-amber'
          : 'tone-green';

  const menuItems = [
    projectworksMenuItem(project, onAddLink),
    ['Edit project', onEditProject],
    null,
    ['Add history', onAddHistory],
    ...item.history.records.flatMap((record) => [
      [`Edit “${record.label}”`, () => onEditHistory(record.id)],
      [
        `Remove “${record.label}”`,
        () => onRemoveHistory(record.id),
        { danger: true },
      ],
    ]),
  ];

  return (
    <li className="fin-card" style={{ '--pc': item.color || 'var(--muted)' }}>
      <header>
        <i
          className="project-ring"
          style={{ color: item.color }}
          aria-hidden="true"
        />
        <span className="fin-card-title">
          <b>{item.name}</b>
          <small>
            {[item.client, item.archived && 'Archived']
              .filter(Boolean)
              .join(' · ') || 'No client'}
          </small>
        </span>
        <Chip {...head} />
      </header>

      {costings.length > 0 && (
        <section className="fin-lead" aria-label={`${item.name} deliverables`}>
          <h4>
            Deliverables
            {item.hasRate && (
              <span className="fin-num">
                {whole(sum(costings, 'spent'))} used of{' '}
                {whole(sum(costings, 'amount'))}
              </span>
            )}
          </h4>
          <ul>
            {item.activities.map((row) => (
              <DeliverableRow
                key={row.id}
                row={row}
                level={levelName(row.levelId)}
                hasRate={item.hasRate}
              />
            ))}
          </ul>
        </section>
      )}

      {hasPhases && (
        <section
          className="fin-phases"
          aria-label={`${item.name} your time by phase`}
        >
          <h4>
            Your time by phase
            <span className="fin-num">
              share of your {formatDays(item.days)}
            </span>
          </h4>
          <ul>
            {item.phases.map((phase) => (
              <PhaseRow
                key={phase.id}
                phase={phase}
                total={item.days}
                hasRate={item.hasRate}
              />
            ))}
          </ul>
        </section>
      )}

      {!costings.length && !hasPhases && (
        <p className="fin-hint">
          No deliverables or phases yet. Add costings in the project editor to
          see your days against each one.
        </p>
      )}

      <section
        className={`fin-own ${budgetTone}`}
        aria-label={`${item.name} project budget`}
      >
        <h4>
          Project budget
          <span className="fin-num">
            {item.hasBudget ? whole(item.budget) : 'No budget'}
          </span>
        </h4>
        <span className="fin-lead-head">
          <span className="fin-lead-name">
            You’ve used {item.hasRate ? whole(item.spent) : '—'}
          </span>
          {item.hasRate && item.pct != null && (
            <b className="fin-lead-left fin-num">{formatPercent(item.pct)}</b>
          )}
        </span>
        {item.hasRate && item.hasBudget && (
          <UsageBar spent={item.spent} amount={item.budget} />
        )}
        <small className="fin-num">
          <b>{formatDays(item.days)}</b> logged by you
        </small>
      </section>

      <footer className="fin-card-foot">
        <button type="button" className="fin-edit" onClick={onEditBudget}>
          Edit budget
        </button>
        <button
          type="button"
          className="fin-more-button"
          aria-label={`More for ${item.name}`}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu({ x: box.right - 200, y: box.bottom + 4 });
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
        <RowMenu
          open={menu}
          items={menuItems}
          label={`More for ${item.name}`}
          onClose={() => setMenu(null)}
        />
      </footer>
    </li>
  );
}
