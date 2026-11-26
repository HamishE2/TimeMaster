import { useMemo, useState } from 'react';
import {
  attentionItems,
  financialsOverview,
  formatMoney,
  formatPercent,
  rateLevelsOf,
  toCents,
  weekCostRows,
} from '../lib/budget.js';
import { isVisible } from '../lib/utils.js';
import { TickMoney } from './FinancialsParts.jsx';
import FinancialsCard from './FinancialsCard.jsx';
import FinancialsWeek from './FinancialsWeek.jsx';
import FinancialsReview from './FinancialsReview.jsx';
import HistoricalUsageForm from './HistoricalUsageForm.jsx';
import RowMenu from './RowMenu.jsx';
import { projectworksMenuItem } from './projectMenu.js';

const KIND_LABELS = {
  costing: 'deliverable',
  phase: 'phase',
  budget: 'project budget',
};

// Usage, never what is left: "$1,860 over" once past it, else "81% used".
function usageText(entry) {
  if (entry.left < 0)
    return `${formatMoney(-entry.left, { whole: true })} over`;
  if (entry.reason === 'plan') return 'Plan over budget';
  return `${formatPercent(entry.pct)} used`;
}

// A headline tile: how many things of one kind are near or over, with the
// worst two named. Colour always comes with a word.
function WatchTile({ label, hasRate, items, empty }) {
  const red = items.some((item) => item.tone === 'red');
  return (
    <article>
      <p className="readout-label">{label}</p>
      <strong
        className={`readout-value ${red ? 'over-text' : items.length ? 'fin-amber-text' : ''}`}
      >
        {hasRate ? items.length : '—'}
      </strong>
      <ul className="fin-watch">
        {!hasRate ? (
          <li>Set an hourly rate to cost time</li>
        ) : items.length ? (
          items.slice(0, 2).map((item) => (
            <li
              key={`${item.project.id}-${item.kind}-${item.id}`}
              className={`tone-${item.tone}`}
            >
              <i aria-hidden="true" />
              <span>
                <b>{item.kind === 'budget' ? item.project.name : item.name}</b>{' '}
                {usageText(item)}
              </span>
            </li>
          ))
        ) : (
          <li className="tone-green">
            <i aria-hidden="true" />
            <span>{empty}</span>
          </li>
        )}
        {hasRate && items.length > 2 && <li>+ {items.length - 2} more</li>}
      </ul>
    </article>
  );
}

const dots = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

function SideItem({ title, value, tone, project, kind, onClick, onMenu }) {
  return (
    <div
      className="fin-side-row"
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <button type="button" className="fin-side-item" onClick={onClick}>
        <span className="fin-side-head">
          <strong>{title}</strong>
          <span
            className={
              tone === 'red'
                ? 'over-text'
                : tone === 'amber'
                  ? 'fin-amber-text'
                  : ''
            }
          >
            {value}
          </span>
        </span>
        <small className="fin-side-sub">
          <i className="project-ring" style={{ color: project.color }} />
          {project.name} · {kind}
        </small>
      </button>
      <button
        type="button"
        className="fin-side-more"
        aria-label={`Options for ${project.name}`}
        aria-haspopup="menu"
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          onMenu({ x: box.right - 200, y: box.bottom + 4 });
        }}
      >
        {dots}
      </button>
    </div>
  );
}

const sumMoney = (list, pick) =>
  list.reduce((cents, item) => cents + toCents(pick(item) || 0), 0) / 100;

// "Timesheet mode but money": headline counters for what needs watching,
// project budget cards led by their costings, the selected week's cost by day
// and the review queue, with the items near or over in the sidebar.
export default function Financials({
  projects,
  settings,
  week,
  days,
  onOpenSettings,
  onEditProject,
  onNewProject,
  onTag,
  onSaveHistory,
  onRemoveHistory,
  onAddLink,
}) {
  const [includeArchived, setIncludeArchived] = useState(false);
  // The ⋯ menu open on a Needs attention item: { x, y, project } or null.
  const [sideMenu, setSideMenu] = useState(null);
  // null, or { projectId, record } for the historical usage form.
  const [historyForm, setHistoryForm] = useState(null);
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
  const { hasRate } = overview;

  // Headline numbers.
  const weekCost = sumMoney(
      weekProjects.flatMap(({ rows }) => rows),
      (row) => row.cost,
    ),
    weekPlanCost = sumMoney(overview.projects, (item) =>
      item.hasRate && isVisible(byId.get(item.id), week)
        ? (item.forecast.thisWeekHours || 0) * item.rate
        : 0,
    );
  // Everything near or over, across projects, worst first. Totals across
  // projects are deliberately not shown: each costing stands on its own.
  const attention = overview.projects
    .flatMap((item) =>
      attentionItems(item).map((entry) => ({ ...entry, project: item })),
    )
    .sort(
      (a, b) =>
        (a.tone === 'red' ? 0 : 1) - (b.tone === 'red' ? 0 : 1) ||
        (b.pct ?? 0) - (a.pct ?? 0),
    );
  const ofKind = (kind) => attention.filter((entry) => entry.kind === kind);
  const tracked = overview.projects.filter(
    (item) =>
      item.hasBudget || item.activities.length || item.history.records.length,
  );
  const flagged = new Set(attention.map((entry) => entry.project.id));
  const onTrack = tracked.filter(
    (item) => item.hasRate && !flagged.has(item.id),
  );
  const untracked = overview.projects.filter(
    (item) => !item.hasRate || !tracked.includes(item),
  );
  const listed = projects.filter(
    (project) => includeArchived || !project.archived,
  );
  const levels = new Map(
    rateLevelsOf(settings).map((level) => [level.id, level.name]),
  );
  const levelName = (levelId) => (levelId && levels.get(levelId)) || null;
  // A costing in Needs attention carries its level: "Workshops · Certified".
  const attentionTitle = (entry) => {
    if (entry.kind === 'budget') return entry.project.name;
    const level =
      entry.kind === 'costing' &&
      levelName(
        entry.project.activities.find((a) => a.id === entry.id)?.levelId,
      );
    return level ? `${entry.name} · ${level}` : entry.name;
  };
  const openSideMenu = (project) => (at) =>
    setSideMenu({ ...at, project: byId.get(project.id) });
  const sideMenuItems = sideMenu
    ? [
        projectworksMenuItem(sideMenu.project, onAddLink),
        ['Edit project', () => onEditProject(sideMenu.project, null)],
        null,
        [
          'Add history',
          () =>
            setHistoryForm({ projectId: sideMenu.project.id, record: null }),
        ],
      ]
    : [];
  const editHistory = (projectId, recordId) =>
    setHistoryForm({
      projectId,
      record: (byId.get(projectId).historicalUsage || []).find(
        (stored) => stored.id === recordId,
      ),
    });

  return (
    <section
      className="workspace financials"
      aria-labelledby="financials-title"
    >
      <div className="week-readouts fin-readouts">
        <article>
          <p className="readout-label">
            Cost this week
          </p>
          <strong className="readout-value">
            {hasRate ? <TickMoney value={weekCost} /> : '—'}
          </strong>
          {/* Only against a plan: with no resourced hours there is nothing
              to measure the week's cost against. */}
          {hasRate && weekPlanCost > 0 && (
            <div
              className={`readout-meter ${weekCost > weekPlanCost ? 'excess' : ''}`}
              aria-hidden="true"
            >
              <i
                style={{
                  width: `${Math.min(100, (weekCost / weekPlanCost) * 100)}%`,
                }}
              />
            </div>
          )}
          {!hasRate && (
            <p className="readout-note">
              <button
                type="button"
                className="link"
                onClick={() => onOpenSettings('rate')}
              >
                Set your hourly rate →
              </button>
            </p>
          )}
        </article>
        <WatchTile
          label="Costings to watch"
          hasRate={hasRate}
          items={ofKind('costing')}
          empty="All costings under 80%"
        />
        <WatchTile
          label="Phases to watch"
          hasRate={hasRate}
          items={ofKind('phase')}
          empty="All phases under 80%"
        />
        <WatchTile
          label="Project budgets to watch"
          hasRate={hasRate}
          items={ofKind('budget')}
          empty="All budgets under 80%"
        />
      </div>

      <div className="sheet fin-main">
        <div className="sheet-toolbar fin-toolbar">
          <div>
            <h2 id="financials-title">Budgets</h2>
          </div>
          <button
            type="button"
            className="fin-history-add"
            disabled={!listed.length}
            onClick={() =>
              setHistoryForm({
                projectId: tracked[0]?.id || null,
                record: null,
              })
            }
          >
            + Add historical usage data
          </button>
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
            <span className="fin-empty-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 3v18" />
                <path d="M16.5 7.5c0-1.7-2-3-4.5-3s-4.5 1.3-4.5 3 2 2.6 4.5 3 4.5 1.3 4.5 3-2 3-4.5 3-4.5-1.3-4.5-3" />
              </svg>
            </span>
            <div>
              <h3>Set your hourly rate to see costs</h3>
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
            <span className="fin-empty-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M4 7.5h14.5a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z" />
                <path d="M4 7.5 15.5 4v3.5" />
                <path d="M15.5 13.75h1" />
              </svg>
            </span>
            <div>
              <h3>No budgets yet</h3>
              <p>Add one in a project’s Budget section.</p>
            </div>
            {overview.projects[0] ? (
              <button
                type="button"
                onClick={() => onEditProject(byId.get(overview.projects[0].id))}
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
              <FinancialsCard
                key={item.id}
                item={item}
                project={byId.get(item.id)}
                levelName={levelName}
                onEditProject={() => onEditProject(byId.get(item.id), null)}
                onAddLink={onAddLink}
                onEditBudget={() => onEditProject(byId.get(item.id))}
                onAddHistory={() =>
                  setHistoryForm({ projectId: item.id, record: null })
                }
                onEditHistory={(recordId) => editHistory(item.id, recordId)}
                onRemoveHistory={(recordId) =>
                  onRemoveHistory(item.id, recordId)
                }
              />
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

        <FinancialsReview
          review={overview.review}
          projects={byId}
          onTag={onTag}
        />
      </div>

      <aside
        className="insights fin-side"
        id="fin-status"
        aria-label="Needs attention"
      >
        <div>
          <h2>Needs attention</h2>
        </div>
        {[
          ['red', 'Over', attention.filter((entry) => entry.tone === 'red')],
          [
            'amber',
            'Near limit',
            attention.filter((entry) => entry.tone === 'amber'),
          ],
        ].map(
          ([tone, label, list]) =>
            list.length > 0 && (
              <section
                className={`insight-group fin-group tone-${tone}`}
                key={tone}
              >
                <h3>
                  {label}
                  <span>{list.length}</span>
                </h3>
                {list.map((entry) => (
                  <SideItem
                    key={`${entry.project.id}-${entry.kind}-${entry.id}`}
                    title={attentionTitle(entry)}
                    value={usageText(entry)}
                    tone={tone}
                    project={entry.project}
                    kind={KIND_LABELS[entry.kind]}
                    onClick={() => onEditProject(byId.get(entry.project.id))}
                    onMenu={openSideMenu(entry.project)}
                  />
                ))}
              </section>
            ),
        )}
        {onTrack.length > 0 && (
          <section className="insight-group fin-group tone-green">
            <h3>
              On track
              <span>{onTrack.length}</span>
            </h3>
            {onTrack.map((item) => (
              <SideItem
                key={item.id}
                title={item.name}
                value={
                  item.hasBudget
                    ? `${formatPercent(item.pct)} used`
                    : `${formatMoney(item.spent, { whole: true })} used`
                }
                project={item}
                kind="project budget"
                onClick={() => onEditProject(byId.get(item.id))}
                onMenu={openSideMenu(item)}
              />
            ))}
          </section>
        )}
        {untracked.length > 0 && (
          <section className="insight-group fin-group tone-neutral">
            <h3>
              No budget or rate
              <span>{untracked.length}</span>
            </h3>
            {untracked.map((item) => (
              <SideItem
                key={item.id}
                title={item.name}
                value={item.hasRate ? 'No budget' : 'No rate'}
                project={item}
                kind="not tracked"
                onClick={() => onEditProject(byId.get(item.id))}
                onMenu={openSideMenu(item)}
              />
            ))}
          </section>
        )}
        {overview.projects.length === 0 && (
          <p className="quiet">No projects yet.</p>
        )}
      </aside>
      <RowMenu
        open={sideMenu}
        items={sideMenuItems}
        label={sideMenu ? `Options for ${sideMenu.project?.name}` : ''}
        onClose={() => setSideMenu(null)}
      />
      {historyForm && (
        <HistoricalUsageForm
          projects={listed}
          settings={settings}
          week={week}
          key={historyForm.key || 'history'}
          projectId={historyForm.projectId}
          record={historyForm.record}
          onClose={() => setHistoryForm(null)}
          onSave={(projectId, record) => {
            onSaveHistory(projectId, record);
            setHistoryForm(null);
          }}
        />
      )}
    </section>
  );
}
