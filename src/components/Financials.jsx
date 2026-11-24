import { useMemo, useState } from 'react';
import {
  BUDGET_NEAR,
  budgetStatus,
  formatEffort,
  financialsOverview,
  formatMoney,
  formatPercent,
  wholeRemaining,
  toCents,
  weekCostRows,
} from '../lib/budget.js';
import { isVisible } from '../lib/utils.js';
import {
  BudgetMeter,
  SpendSparkline,
  StackedBar,
  StatusChip,
  TickMoney,
  UsageRing,
} from './FinancialsParts.jsx';
import FinancialsWeek from './FinancialsWeek.jsx';
import FinancialsActivities from './FinancialsActivities.jsx';
import FinancialsReview from './FinancialsReview.jsx';

// Sidebar groups, most urgent first. Each has a text label so the colour is
// never the only signal.
const GROUPS = [
  ['red', 'Over or at budget'],
  ['amber', 'Approaching budget'],
  ['yellow', 'Resourcing exceeds budget'],
  ['green', 'Under budget'],
  ['neutral', 'No budget or rate'],
];

const sumMoney = (list, pick) =>
  list.reduce((cents, item) => cents + toCents(pick(item) || 0), 0) / 100;

// "Timesheet mode but money": headline counters, project budget cards, the
// selected week's cost by day, costed activities and the review queue, with
// projects grouped by budget status in the sidebar.
export default function Financials({
  projects,
  settings,
  week,
  days,
  onOpenSettings,
  onEditProject,
  onNewProject,
  onTag,
}) {
  const [includeArchived, setIncludeArchived] = useState(false);
  const overview = useMemo(
    () => financialsOverview(projects, settings, week, { includeArchived }),
    [projects, settings, week, includeArchived],
  );
  const leave = settings.leaveWeeks?.[week] || [];
  const weekProjects = useMemo(
    () =>
      projects
        .filter((project) => includeArchived || !project.archived)
        .map((project) => ({
          project,
          rows: weekCostRows(project, settings, week),
        }))
        .filter(
          ({ project, rows }) =>
            isVisible(project, week) || rows.some((row) => row.hours > 0),
        ),
    [projects, settings, week, includeArchived],
  );
  const byId = new Map(projects.map((project) => [project.id, project]));
  const rated = new Set(
    overview.projects.filter((item) => item.hasRate).map((item) => item.id),
  );
  const { hasRate, rate, perDay } = overview;
  const effort = (item, dollars) => formatEffort(dollars, item.rate, perDay);
  const rateText = overview.mixedRates
    ? 'project rates'
    : `${formatMoney(rate ?? overview.projects.find((item) => item.hasRate)?.rate)}/h`;

  // Headline numbers.
  const weekCost = sumMoney(
      weekProjects.flatMap(({ rows }) => rows),
      (row) => row.cost,
    ),
    // Only hours on projects with a rate are costed, so only they are
    // counted in "Xh × rate".
    weekHours = weekProjects
      .filter(({ project }) => rated.has(project.id))
      .flatMap(({ rows }) => rows)
      .reduce((sum, row) => sum + row.hours, 0),
    weekPlanCost = sumMoney(overview.projects, (item) =>
      item.hasRate && isVisible(byId.get(item.id), week)
        ? (item.forecast.thisWeekHours || 0) * item.rate
        : 0,
    );
  // Portfolio budget figures only cover projects that can be costed: a
  // budget on a project with no rate would count as $0 spent.
  const budgeted = overview.projects.filter(
      (item) => item.hasBudget && item.hasRate,
    ),
    budgetTotal = sumMoney(budgeted, (item) => item.budget),
    budgetSpent = sumMoney(budgeted, (item) => item.spent),
    usedPct = budgetTotal > 0 ? budgetSpent / budgetTotal : null,
    remainingTotal = sumMoney(budgeted, (item) => item.remaining),
    afterPlan = sumMoney(budgeted, (item) =>
      item.forecast.planKnown ? item.budget - item.forecast.total : item.remaining,
    ),
    portfolioStatus = budgetStatus({
      hasRate,
      budgetCents: budgeted.length ? toCents(budgetTotal) : null,
      spentCents: toCents(budgetSpent),
    });
  const grouped = Object.fromEntries(GROUPS.map(([tone]) => [tone, []]));
  overview.projects.forEach((item) => grouped[item.status.tone].push(item));
  const atRisk = grouped.red.length + grouped.amber.length;
  const tracked = overview.projects.filter(
    (item) => item.hasBudget || item.activities.length,
  );

  return (
    <section
      className="workspace financials"
      aria-labelledby="financials-title"
    >
      <div className="week-readouts fin-readouts">
        <article>
          <p className="readout-label">
            Cost this week <span className="fin-gst">ex GST</span>
          </p>
          <strong className="readout-value">
            {hasRate ? <TickMoney value={weekCost} /> : '—'}
          </strong>
          <div
            className={`readout-meter ${weekPlanCost > 0 && weekCost > weekPlanCost ? 'excess' : ''}`}
            aria-hidden="true"
          >
            <i
              style={{
                width: `${weekPlanCost > 0 ? Math.min(100, (weekCost / weekPlanCost) * 100) : weekCost > 0 ? 100 : 0}%`,
              }}
            />
          </div>
          <p className="readout-note">
            {!hasRate ? (
              <button
                type="button"
                className="link"
                onClick={() => onOpenSettings('rate')}
              >
                Set your hourly rate →
              </button>
            ) : (
              <>
                <b>{Math.round(weekHours * 100) / 100}h</b> × {rateText}
                {weekPlanCost > 0 &&
                  ` · plan ${formatMoney(weekPlanCost, { whole: true })}`}
              </>
            )}
          </p>
        </article>
        <article>
          <p className="readout-label">Budget used</p>
          <strong className="readout-value">
            {hasRate && usedPct != null ? (
              <>
                {Math.round(usedPct * 100)}
                <small>%</small>
              </>
            ) : (
              '—'
            )}
          </strong>
          <div
            className={`readout-meter fin-tone-meter tone-${portfolioStatus.tone}`}
            aria-hidden="true"
          >
            <i
              style={{
                width: `${usedPct == null ? 0 : Math.min(100, usedPct * 100)}%`,
              }}
            />
          </div>
          <p className="readout-note">
            {budgeted.length ? (
              <>
                <b>{hasRate ? formatMoney(budgetSpent, { whole: true }) : '—'}</b>{' '}
                of {formatMoney(budgetTotal, { whole: true })} ·{' '}
                {budgeted.length} budget{budgeted.length === 1 ? '' : 's'}
              </>
            ) : (
              'No project budgets yet'
            )}
          </p>
        </article>
        <article>
          <p className="readout-label">
            Remaining budget <span className="fin-gst">ex GST</span>
          </p>
          <strong
            className={`readout-value ${remainingTotal < 0 ? 'over-text' : ''}`}
          >
            {hasRate && budgeted.length ? (
              <TickMoney value={remainingTotal} />
            ) : (
              '—'
            )}
          </strong>
          <div className="readout-meter fin-plan-meter" aria-hidden="true">
            <i
              style={{
                width: `${hasRate && budgetTotal > 0 ? Math.max(0, Math.min(100, (remainingTotal / budgetTotal) * 100)) : 0}%`,
              }}
            />
          </div>
          <p className="readout-note">
            {hasRate && budgeted.length ? (
              <>
                <b className={afterPlan < 0 ? 'fin-yellow-text' : ''}>
                  {formatMoney(afterPlan, { whole: true })}
                </b>{' '}
                left after the resourcing plan
              </>
            ) : (
              'Budget minus logged cost'
            )}
          </p>
        </article>
        <article>
          <p className="readout-label">Projects at risk</p>
          <strong className={`readout-value ${atRisk ? 'over-text' : ''}`}>
            {hasRate ? atRisk : '—'}
          </strong>
          <div className="readout-meter fin-risk-meter" aria-hidden="true">
            {['red', 'amber', 'yellow', 'green'].map((tone) =>
              grouped[tone].length ? (
                <i
                  key={tone}
                  className={`tone-${tone}`}
                  style={{
                    width: `${(grouped[tone].length / Math.max(1, overview.projects.length - grouped.neutral.length)) * 100}%`,
                  }}
                />
              ) : null,
            )}
          </div>
          <p className="readout-note">
            {grouped.red.length} over · {grouped.amber.length} near ·{' '}
            {grouped.yellow.length} plan over{' '}
            <a href="#fin-status">Breakdown →</a>
          </p>
        </article>
      </div>

      <div className="sheet fin-main">
        <div className="sheet-toolbar fin-toolbar">
          <div>
            <h2 id="financials-title">Budgets</h2>
            <span>
              {tracked.length} of {overview.projects.length} projects tracked
              {hasRate && ` · ${rateText} · ex GST`}
            </span>
          </div>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            <span>Include archived</span>
          </label>
        </div>

        {!hasRate && (
          <div className="fin-empty fin-callout" role="note">
            <span className="fin-empty-glyph" aria-hidden="true">$</span>
            <div>
              <h3>Set your hourly rate to see costs</h3>
              <p>
                Each logged hour costs your rate. Until it is set, every budget
                shows as grey and costs read as a dash. Budgets and costings
                you add are kept either way.
              </p>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => onOpenSettings('rate')}
            >
              Set hourly rate
            </button>
          </div>
        )}

        {tracked.length === 0 ? (
          <div className="fin-empty">
            <span className="fin-empty-glyph" aria-hidden="true">◎</span>
            <div>
              <h3>No budgets yet</h3>
              <p>
                Open a project and fill in its <b>Budget</b> section: a total,
                optional phase buckets, and costed activities such as “Quick
                reference guides (QRGs) · $4,000”. Spend is logged hours × your
                rate; the resourcing plan shows what is still to come.
              </p>
            </div>
            {overview.projects[0] ? (
              <button
                type="button"
                onClick={() =>
                  onEditProject(byId.get(overview.projects[0].id))
                }
              >
                Add a budget to {overview.projects[0].name}
              </button>
            ) : (
              <button type="button" onClick={onNewProject}>
                New project
              </button>
            )}
          </div>
        ) : (
          <ul className="fin-cards">
            {tracked.map((item) => (
              <li
                key={item.id}
                className={`fin-card tone-${item.status.tone}`}
                style={{ '--pc': item.color || 'var(--muted)' }}
              >
                <header>
                  <UsageRing
                    pct={item.hasRate ? item.pct : null}
                    tone={item.status.tone}
                  />
                  <span className="fin-card-title">
                    <b>{item.name}</b>
                    <small>
                      {[item.client, item.archived && 'Archived']
                        .filter(Boolean)
                        .join(' · ') || 'No client'}
                    </small>
                    <StatusChip status={item.status} />
                  </span>
                  <SpendSparkline
                    series={item.hasRate ? item.series : null}
                    budget={item.budget}
                    tone={item.status.tone}
                  />
                </header>
                <dl className="fin-figures">
                  <div>
                    <dt>Budget</dt>
                    <dd>
                      {formatMoney(item.budget, { whole: true })}
                      {item.hasBudget && effort(item, item.budget) && (
                        <small>{effort(item, item.budget)}</small>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Spent</dt>
                    <dd>{item.hasRate ? formatMoney(item.spent, { whole: true }) : '—'}</dd>
                  </div>
                  <div>
                    <dt>Remaining</dt>
                    <dd className={item.remaining < 0 ? 'over-text' : ''}>
                      {item.hasRate && item.hasBudget
                        ? formatMoney(wholeRemaining(item.budget, item.spent), {
                            whole: true,
                          })
                        : '—'}
                      {item.hasBudget && effort(item, item.remaining) && (
                        <small>{effort(item, item.remaining)}</small>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Forecast</dt>
                    <dd
                      className={
                        item.status.flags.resourcingOver ? 'fin-yellow-text' : ''
                      }
                    >
                      {item.hasRate && item.forecast.planKnown
                        ? formatMoney(item.forecast.total, { whole: true })
                        : '—'}
                    </dd>
                  </div>
                </dl>
                {item.hasRate && item.hasBudget && (
                  <>
                    <BudgetMeter
                      spent={item.spent}
                      budget={item.budget}
                      forecast={
                        item.forecast.planKnown ? item.forecast.total : null
                      }
                      tone={item.status.tone}
                      near={BUDGET_NEAR}
                    />
                    <p className="fin-meter-legend" aria-hidden="true">
                      <span><i className="key-spent" />Spent</span>
                      <span><i className="key-plan" />+ plan{item.forecast.openEnded ? ' (12 wks)' : ''}</span>
                      <span><i className="key-tick" />75%</span>
                      <span><i className="key-limit" />Budget</span>
                    </p>
                  </>
                )}
                <p className="fin-status-text">{item.status.message}</p>
                {item.warning && (
                  <p className="fin-warning" role="note">
                    <b aria-hidden="true">!</b> {item.warning}
                  </p>
                )}
                {item.status.level !== 'resourcing' &&
                  item.status.flags.resourcingOver && (
                    <p className="fin-resourcing-note">
                      <StatusChip
                        small
                        status={{ tone: 'yellow', label: 'Plan over' }}
                      />{' '}
                      The resourcing plan alone would go{' '}
                      {formatMoney(item.forecast.overBy, { whole: true })} over —
                      a planning issue, not your logging.
                    </p>
                  )}
                {item.hasRate && (
                  <dl className="fin-small">
                    <div>
                      <dt>Burn</dt>
                      <dd>{formatMoney(item.burn.weekly, { whole: true })}/wk</dd>
                    </div>
                    <div>
                      <dt>Runway</dt>
                      <dd>
                        {item.remaining != null && item.remaining <= 0
                          ? 'None left'
                          : item.burn.runwayWeeks == null
                          ? '—'
                          : item.burn.runwayWeeks > 104
                            ? '2 yrs +'
                            : `${Math.floor(item.burn.runwayWeeks)} wks`}
                      </dd>
                    </div>
                    <div>
                      <dt>Logged</dt>
                      <dd>{Math.round(item.hours * 100) / 100}h</dd>
                    </div>
                  </dl>
                )}
                {item.hasRate && item.spent > 0 && (
                  <StackedBar
                    label={`${item.name} cost by phase`}
                    segments={item.byPhase.map((line) => ({
                      id: line.id,
                      name: line.name,
                      value: line.spent,
                    }))}
                  />
                )}
                {item.phases.length > 1 && (
                  <ul
                    className="fin-buckets"
                    aria-label={`${item.name} phase budgets`}
                  >
                    {item.phases.map((phase) => (
                      <li key={phase.id}>
                        <span>{phase.name}</span>
                        <span className="fin-num">
                          {item.hasRate
                            ? formatMoney(phase.spent, { whole: true })
                            : '—'}{' '}
                          /{' '}
                          {phase.budget == null
                            ? '—'
                            : formatMoney(phase.budget, { whole: true })}
                        </span>
                        <StatusChip small status={phase.status} />
                      </li>
                    ))}
                  </ul>
                )}
                {item.bucketsExceedBudget && (
                  <p className="fin-warning">
                    <b aria-hidden="true">!</b> Phase buckets add up to more
                    than the total budget.
                  </p>
                )}
                {item.leaveHours > 0 && (
                  <p className="fin-muted">
                    {Math.round(item.leaveHours * 100) / 100}h on leave days is
                    not costed.
                  </p>
                )}
                <button
                  type="button"
                  className="fin-edit"
                  onClick={() => onEditProject(byId.get(item.id))}
                >
                  Edit budget
                </button>
              </li>
            ))}
          </ul>
        )}

        <FinancialsWeek
          entries={weekProjects}
          settings={settings}
          week={week}
          days={days}
          leave={leave}
          hasRate={hasRate}
        />

        <FinancialsActivities
          overview={overview}
          onEditProject={(id) => onEditProject(byId.get(id))}
        />

        <FinancialsReview
          review={overview.review}
          projects={byId}
          onTag={onTag}
        />
      </div>

      <aside className="insights fin-side" id="fin-status" aria-label="Budget status">
        <div>
          <h2>Budget status</h2>
        </div>
        {GROUPS.map(
          ([tone, label]) =>
            grouped[tone].length > 0 && (
              <section className={`insight-group fin-group tone-${tone}`} key={tone}>
                <h3>
                  {label}
                  <span>{grouped[tone].length}</span>
                </h3>
                {grouped[tone].map((item) => (
                  <button
                    type="button"
                    className="fin-side-item"
                    key={item.id}
                    onClick={() => onEditProject(byId.get(item.id))}
                  >
                    <span className="fin-side-head">
                      <strong>
                        <i
                          className="project-ring"
                          style={{ color: item.color }}
                        />
                        {item.name}
                      </strong>
                      <span className="fin-num">
                        {item.hasBudget && item.hasRate
                          ? `${formatPercent(item.pct)} · ${
                              item.remaining < 0
                                ? `${formatMoney(-item.remaining, { whole: true })} over`
                                : `${formatMoney(item.remaining, { whole: true })} left`
                            }`
                          : item.status.label}
                      </span>
                    </span>
                    {item.hasRate && item.hasBudget ? (
                      <BudgetMeter
                        spent={item.spent}
                        budget={item.budget}
                        forecast={
                          item.forecast.planKnown ? item.forecast.total : null
                        }
                        tone={item.status.tone}
                      />
                    ) : (
                      <small className="fin-muted">
                        {item.hasRate
                          ? `${formatMoney(item.spent, { whole: true })} logged · add a budget`
                          : 'Set a rate to cost this project'}
                      </small>
                    )}
                  </button>
                ))}
              </section>
            ),
        )}
        {overview.projects.length === 0 && (
          <p className="quiet">No projects yet.</p>
        )}
        <p className="fin-scale" aria-label="Status colour key">
          <StatusChip small status={{ tone: 'green', label: 'Under' }} />
          <StatusChip small status={{ tone: 'amber', label: '75%+' }} />
          <StatusChip small status={{ tone: 'red', label: 'At / over' }} />
          <StatusChip small status={{ tone: 'yellow', label: 'Plan over' }} />
          <StatusChip small status={{ tone: 'neutral', label: 'No budget' }} />
        </p>
      </aside>
    </section>
  );
}
