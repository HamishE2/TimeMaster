import { useState } from 'react';
import {
  attentionItems,
  formatLeft as leftText,
  budgetLow,
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
        label: `${plural(count('costing', tone), 'costing')} ${word}`,
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

function barWidth(spent, amount) {
  if (amount == null) return 0;
  if (amount <= 0) return spent > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, (spent / amount) * 100));
}

// A costing (or the lead phase / budget): what's left in bold, a bar, then
// spent of amount.
function LeadRow({ name, level, spent, amount, pct, tone, hasRate }) {
  const left = amount == null ? null : amount - spent;
  return (
    <li className={`fin-lead-row tone-${tone}`}>
      <span className="fin-lead-head">
        <span className="fin-lead-name">
          {name}
          {level && <span className="fin-level">{level}</span>}
        </span>
        <b
          className={`fin-lead-left fin-num${left != null && left < 0 ? ' over-text' : ''}`}
        >
          {!hasRate ? '—' : left == null ? whole(spent) : leftText(left)}
        </b>
      </span>
      {hasRate && amount != null && (
        <span className="fin-bar" aria-hidden="true">
          <i style={{ width: `${barWidth(spent, amount)}%` }} />
        </span>
      )}
      <small className="fin-num">
        {amount == null
          ? hasRate
            ? 'No amount set'
            : 'No rate'
          : hasRate
            ? `${whole(spent)} of ${whole(amount)} · ${formatPercent(pct)}`
            : `${whole(amount)} · no rate`}
      </small>
    </li>
  );
}

// A phase under the costings: name, a thin bar and spent / budget.
function PhaseRow({ phase, hasRate }) {
  return (
    <li className={`fin-phase-row tone-${phase.status.tone}`}>
      <span className="fin-phase-name">{phase.name}</span>
      <span className="fin-bar is-thin" aria-hidden="true">
        {hasRate && phase.budget != null && (
          <i style={{ width: `${barWidth(phase.spent, phase.budget)}%` }} />
        )}
      </span>
      <span className="fin-num fin-phase-of">
        {hasRate ? whole(phase.spent) : '—'} /{' '}
        {phase.budget == null ? '—' : whole(phase.budget)}
      </span>
    </li>
  );
}

function LowBanner({ low }) {
  const [title, text] =
    low.reason === 'over'
      ? [
          'Project budget used up',
          low.left < 0
            ? `${whole(-low.left)} over budget.`
            : 'Budget fully used.',
        ]
      : low.reason === 'near'
        ? ['Project budget near its limit', `${whole(low.left)} left.`]
        : [
            'Plan goes over the project budget',
            'The resourcing plan costs more than is left.',
          ];
  return (
    <p className={`fin-low tone-${low.tone}`} role="note">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2 20h20z" />
        <path d="M12 10v4M12 17v.5" />
      </svg>
      <span>
        <b>{title}</b>
        {text}
      </span>
    </p>
  );
}

// One project's budget card: costings first, then phases, then the project
// budget as one line unless it is low.
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
  const low = budgetLow(item);
  const head = headline(item, attention);
  const costings = item.activities.filter((a) => a.amount != null);
  const hasPhases = item.phases.length > 1;
  const lead = costings.length
    ? 'costings'
    : hasPhases
      ? 'phases'
      : item.hasBudget
        ? 'budget'
        : null;
  const sum = (list, key) =>
    list.reduce((n, row) => n + Math.round((row[key] || 0) * 100), 0) / 100;

  let leadLabel = null,
    leadTotal = null,
    rows = [];
  if (lead === 'costings') {
    leadLabel = 'Costings';
    leadTotal = `${whole(sum(costings, 'spent'))} of ${whole(sum(costings, 'amount'))}`;
    rows = item.activities.map((a) => ({
      id: a.id,
      name: a.name,
      level: levelName(a.levelId),
      spent: a.spent,
      amount: a.amount,
      pct: a.pct,
      tone: a.status.tone,
    }));
  } else if (lead === 'phases') {
    leadLabel = 'Phases';
    leadTotal = item.hasBudget
      ? `${whole(item.spent)} of ${whole(item.budget)}`
      : null;
    rows = item.phases.map((p) => ({
      id: p.id,
      name: p.name,
      spent: p.spent,
      amount: p.budget,
      pct: p.pct,
      tone: p.status.tone,
    }));
  } else if (lead === 'budget') {
    leadLabel = 'Project budget';
    rows = [
      {
        id: 'budget',
        name: 'Whole project',
        spent: item.spent,
        amount: item.budget,
        pct: item.pct,
        tone: item.status.tone === 'yellow' ? 'amber' : item.status.tone,
      },
    ];
  }

  const budgetLine =
    lead === 'budget'
      ? 'No costings or phase budgets yet'
      : item.hasBudget
        ? `Project budget ${whole(item.budget)}${item.hasRate ? ` · ${leftText(item.remaining)}` : ''}`
        : 'No project budget';
  const records = item.history.records;
  const recordItems = (list) =>
    list.flatMap((record) => [
      [`Edit “${record.label}”`, () => onEditHistory(record.id)],
      [
        `Remove “${record.label}”`,
        () => onRemoveHistory(record.id),
        { danger: true },
      ],
    ]);
  const menuItems = [
    projectworksMenuItem(project, onAddLink),
    ['Edit project', onEditProject],
    null,
    ['Add history', onAddHistory],
    ...recordItems(records),
  ];
  const historyText = (amount, list) =>
    item.hasRate || list.every((r) => r.unit === 'money')
      ? whole(amount)
      : `${Math.round(list.reduce((n, r) => n + (r.hours || 0), 0) * 100) / 100}h`;

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

      {low && <LowBanner low={low} />}

      {lead ? (
        <section
          className="fin-lead"
          aria-label={`${item.name} ${leadLabel.toLowerCase()}`}
        >
          <h4>
            {leadLabel}
            {item.hasRate && leadTotal && (
              <span className="fin-num">{leadTotal}</span>
            )}
          </h4>
          <ul>
            {rows.map((row) => (
              <LeadRow key={row.id} {...row} hasRate={item.hasRate} />
            ))}
          </ul>
        </section>
      ) : (
        <p className="fin-muted">No costings or budget yet.</p>
      )}

      {lead === 'costings' && hasPhases && (
        <section className="fin-phases" aria-label={`${item.name} phases`}>
          <h4>Phases</h4>
          <ul>
            {item.phases.map((phase) => (
              <PhaseRow key={phase.id} phase={phase} hasRate={item.hasRate} />
            ))}
          </ul>
        </section>
      )}

      {item.bucketsExceedBudget && (
        <p className="fin-muted over-text">
          Phase budgets add up to more than the total.
        </p>
      )}

      <footer className="fin-card-foot">
        <span>
          {budgetLine}
          {records.length > 0 && (
            <small>
              Includes {historyText(item.history.spent, records)} historical
              usage
            </small>
          )}
        </span>
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
