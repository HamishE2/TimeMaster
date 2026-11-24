import { ColumnHeader } from './ColumnHeader.jsx';
import { useColumnWidths } from './useColumnWidths.js';
import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import RowMenu from './RowMenu.jsx';
import { hasPhases } from '../lib/tasks.js';
import {
  DAY_NAMES,
  DAY_SHORT,
  EPSILON,
  fmt,
  projectMetrics,
  weekDates,
} from '../lib/utils.js';
import { categoriseProjects } from '../lib/projectGrouping.js';
import {
  frontloadSuggestion,
  frontloadAdjustment,
} from '../lib/frontloading.js';
import ProjectRow from './ProjectRow.jsx';
import TaskEntryRow from './TaskEntryRow.jsx';
import { taskHoursForDay, taskLinesFor } from '../lib/taskLines.js';
import EntryPopover from './EntryPopover.jsx';
import QuickEntryBar from './QuickEntryBar.jsx';
import TickNumber from './TickNumber.jsx';
import WeekCelebration from './WeekCelebration.jsx';
import { weekIsComplete } from '../lib/weekGoal.js';

export default function TimesheetTable({
  projects,
  allProjects,
  capacityByDay,
  category,
  week,
  days,
  leave,
  leaveWeeks,
  totals,
  onEntry,
  onTaskEntry,
  onNote,
  onSaveNote,
  onUndo,
  onCheckpoint,
  renderNoteExtras,
  onAddLine,
  onRemoveTaskLine,
  onLeave,
  onEdit,
  onFrontload,
  onSuggestFrontload,
  onRemove,
  onPlace,
  onPlaceTask,
}) {
  const dayTotal = (day) =>
      projects.reduce(
        (sum, project) =>
          sum +
          (leave.includes(day)
            ? 0
            : Number(project.entries?.[week]?.[day] || 0) +
              taskHoursForDay(project, week, day)),
        0,
      ),
    // A day is measured against its own working capacity (e.g. 7.6h), not
    // the week's resourced plan spread across the days.
    dailyTarget = (day) =>
      leave.includes(day) ? 0 : Math.max(0, Number(capacityByDay?.[day]) || 0),
    over = totals.remaining < -EPSILON,
    groups = categoriseProjects(projects, category, week, leaveWeeks),
    columnCount = days.length + 5;
  const today = new Date().toDateString();
  const sizing = useColumnWidths();
  const columns = [
    ['project', 'Project / task', 240, 170],
    ...days.map((day) => ['day-' + day, DAY_NAMES[day], 66, 58]),
    ['logged', 'Logged', 72, 64],
    ['plan', 'Plan', 76, 70],
    ['allowance', 'Allowance', 102, 86],
    ['actions', 'Actions', 40, 40],
  ];
  const widths = columns.map(([id, , initial]) => sizing.widths[id] || initial);

  // ---- Entry popover ----
  // Opens on focus of any hours cell. `via` remembers whether a click or the
  // keyboard got there: after a click, Tab goes to the note; while tabbing
  // through cells, Tab keeps moving cell to cell.
  const [entryTarget, setEntryTarget] = useState(null);
  const pointerFocus = useRef(false);
  const quietFocus = useRef(null);
  const closeEntry = () => setEntryTarget(null);
  const entryFrom = (node) => {
    const [projectId, taskId, day] = node.dataset.entry.split('|');
    return { projectId, taskId: taskId || null, day: Number(day) };
  };
  const onCellFocus = (event) => {
    const node = event.target;
    if (!node.matches?.('input[data-entry]')) return;
    if (quietFocus.current === node.dataset.entry) {
      quietFocus.current = null;
      return;
    }
    const next = entryFrom(node);
    setEntryTarget({ ...next, via: pointerFocus.current ? 'pointer' : 'keyboard' });
    pointerFocus.current = false;
  };
  const refocusEntry = (key) => {
    quietFocus.current = key;
    requestAnimationFrame(() =>
      tbodyRef.current?.querySelector(`input[data-entry="${key}"]`)?.focus(),
    );
  };
  const onCellKeyDown = (event) => {
    const node = event.target;
    if (!node.matches?.('input[data-entry]')) return;
    const note = () =>
      document.querySelector('.entry-popover .entry-popover-note');
    if (event.key === 'Escape') {
      node.value = node.defaultValue;
      setEntryTarget(null);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      setEntryTarget(null);
      const key = node.dataset.entry;
      node.blur();
      refocusEntry(key);
    } else if (
      event.key === 'Tab' &&
      !event.altKey &&
      (event.shiftKey || entryTarget?.via !== 'pointer')
    ) {
      // Hop straight between hours cells, skipping grips and row menus.
      const cells = [
          ...(tbodyRef.current?.querySelectorAll('input[data-entry]') || []),
        ],
        next = cells[cells.indexOf(node) + (event.shiftKey ? -1 : 1)];
      if (next) {
        event.preventDefault();
        next.focus();
      }
    } else if (
      entryTarget &&
      (event.key === 'ArrowDown' ||
        (event.altKey && event.key.toLowerCase() === 'n') ||
        (event.key === 'Tab' && !event.shiftKey && entryTarget.via === 'pointer'))
    ) {
      event.preventDefault();
      note()?.focus();
    }
  };
  const entryProject =
    entryTarget && projects.find((p) => p.id === entryTarget.projectId);
  const setEntryHours = (value) => {
    if (!entryTarget) return;
    const { projectId, taskId, day } = entryTarget;
    if (taskId) onTaskEntry(projectId, taskId, week, day, value);
    else onEntry(projectId, week, day, value);
  };

  // ---- Row menu ----
  const [menu, setMenu] = useState(null);
  const closeMenu = useCallback((restore) => {
    setMenu((current) => {
      if (restore) current?.trigger?.focus?.();
      return null;
    });
  }, []);
  const openMenu = (event, items, label) => {
    if (event.type === 'contextmenu') {
      if (event.target.closest('input')) return; // keep the native copy/paste menu
      event.preventDefault();
      setMenu({ x: event.clientX, y: event.clientY, items, label });
    } else {
      const r = event.currentTarget.getBoundingClientRect();
      setMenu({
        x: r.right - 180,
        y: r.bottom + 4,
        items,
        label,
        trigger: event.currentTarget,
      });
    }
  };

  // ---- Reordering ----
  // Projects reorder within their visible group; phase lines reorder within
  // their project. Every reorder (drag, keyboard, menu) snapshots each row's
  // position first; after the new order renders, rows slide from their old
  // spots (FLIP). Rows carry data-row keys so both kinds animate together.
  const tbodyRef = useRef(null);
  const flip = useRef(null);
  const refocus = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(null);
  const peersOf = (id) =>
    groups.find((g) => g.projects.some((p) => p.id === id))?.projects || [];
  const rowsOf = (id) => [
    ...(tbodyRef.current?.querySelectorAll(`tr[data-project="${id}"]`) || []),
  ];
  const taskRow = (projectId, taskId) =>
    tbodyRef.current?.querySelector(`tr[data-row="t:${projectId}:${taskId}"]`);
  // A reorderable list: items in display order, how to find each item's rows,
  // and how to commit "put key before/after targetKey".
  const projectList = (id) => ({
    items: peersOf(id).map((p) => ({ key: p.id, rows: () => rowsOf(p.id) })),
    commit: (key, target, after) => onPlace(key, target, after),
    grip: (key) => key,
  });
  const taskList = (p) => ({
    items: taskLinesFor(p, week).map((t) => ({
      key: t.id,
      rows: () => [taskRow(p.id, t.id)].filter(Boolean),
    })),
    commit: (key, target, after) => onPlaceTask(p.id, key, target, after),
    grip: (key) => `${p.id}:${key}`,
  });
  const allRows = () => [
    ...(tbodyRef.current?.querySelectorAll('tr[data-row]') || []),
  ];
  const snapshot = () =>
    new Map(
      allRows().map((tr) => [tr.dataset.row, tr.getBoundingClientRect().top]),
    );
  const clearTransforms = () => {
    for (const tr of allRows()) {
      tr.style.transition = 'none';
      tr.style.transform = '';
    }
  };
  const animatedCommit = (list, key, target, after) => {
    flip.current = snapshot();
    clearTransforms();
    list.commit(key, target, after);
  };
  useLayoutEffect(() => {
    const before = flip.current;
    if (before) {
      flip.current = null;
      const reduce = window.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const moving = [];
      for (const tr of allRows()) {
        const oldTop = before.get(tr.dataset.row);
        if (oldTop == null) continue;
        const delta = oldTop - tr.getBoundingClientRect().top;
        tr.style.transition = 'none';
        tr.style.transform =
          Math.abs(delta) < 1 || reduce ? '' : `translateY(${delta}px)`;
        if (tr.style.transform) moving.push(tr);
      }
      if (moving.length) {
        moving[0].getBoundingClientRect(); // commit the start positions
        for (const tr of moving) {
          tr.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
          tr.style.transform = '';
        }
      }
    }
    if (refocus.current) {
      tbodyRef.current
        ?.querySelector(`[data-grip="${refocus.current}"]`)
        ?.focus();
      refocus.current = null;
    }
  });
  const neighbourIn = (list, key, direction) => {
    const i = list.items.findIndex((item) => item.key === key);
    return i < 0 ? undefined : list.items[i + direction];
  };
  const moveIn = (list, key, direction) => {
    const other = neighbourIn(list, key, direction);
    if (other) animatedCommit(list, key, other.key, direction > 0);
  };
  const moveBy = (id, direction) => moveIn(projectList(id), id, direction);

  const onGripDown = (event, list, key) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const blocks = list.items
      .map((item) => {
        const rows = item.rows();
        if (!rows.length) return null;
        const top = rows[0].getBoundingClientRect().top;
        const bottom = rows.at(-1).getBoundingClientRect().bottom;
        return { key: item.key, rows, top, height: bottom - top };
      })
      .filter(Boolean);
    const from = blocks.findIndex((b) => b.key === key);
    if (from < 0) return;
    drag.current = { list, key, startY: event.clientY, blocks, from, to: from };
    setDragging(list.grip(key));
  };
  const onGripMove = (event) => {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.startY;
    const me = d.blocks[d.from];
    const centre = me.top + dy + me.height / 2;
    let to = 0;
    d.blocks.forEach((b, i) => {
      if (i !== d.from && b.top + b.height / 2 < centre) to += 1;
    });
    d.to = to;
    me.rows.forEach((tr) => {
      tr.style.transition = 'none';
      tr.style.transform = `translateY(${dy}px)`;
    });
    d.blocks.forEach((b, i) => {
      if (i === d.from) return;
      const shift =
        i > d.from && i <= to
          ? -me.height
          : i < d.from && i >= to
            ? me.height
            : 0;
      b.rows.forEach((tr) => {
        tr.style.transition = 'transform 160ms ease';
        tr.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    });
  };
  const endDrag = (cancel) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(null);
    if (cancel || d.to === d.from) {
      d.blocks.forEach((b) =>
        b.rows.forEach((tr) => {
          tr.style.transition = 'transform 180ms ease';
          tr.style.transform = '';
        }),
      );
      return;
    }
    const others = d.blocks.filter((_, i) => i !== d.from);
    const after = d.to >= others.length;
    animatedCommit(
      d.list,
      d.key,
      (after ? others.at(-1) : others[d.to]).key,
      after,
    );
  };
  const grip = (list, key, name) => (
    <button
      type="button"
      className="row-grip"
      data-grip={list.grip(key)}
      aria-label={`Reorder ${name}. Use arrow keys to move.`}
      title="Drag to reorder"
      onPointerDown={(event) => onGripDown(event, list, key)}
      onPointerMove={onGripMove}
      onPointerUp={() => endDrag(false)}
      onPointerCancel={() => endDrag(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          refocus.current = list.grip(key);
          moveIn(list, key, event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'Escape') endDrag(true);
      }}
    >
      <svg viewBox="0 0 10 10" aria-hidden="true">
        <circle cx="2.5" cy="2.5" r="1.5" />
        <circle cx="7.5" cy="2.5" r="1.5" />
        <circle cx="2.5" cy="7.5" r="1.5" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </svg>
    </button>
  );
  const gripFor = (p) => grip(projectList(p.id), p.id, p.name);
  const neighbour = (id, direction) =>
    neighbourIn(projectList(id), id, direction);
  // Days on which a project's running total passes its usable allowance.
  // Only entries on those days are coloured; everything else stays neutral.
  const overDaysFor = (p) => {
    const limit = projectMetrics(p, week, leaveWeeks).effective;
    const over = new Set();
    if (limit == null) return over;
    let running = 0;
    for (const day of days) {
      if (leave.includes(day)) continue;
      running +=
        Number(p.entries?.[week]?.[day] || 0) + taskHoursForDay(p, week, day);
      if (running > limit + EPSILON) over.add(day);
    }
    return over;
  };
  const projectMenu = (p) =>
    [
      hasPhases(p) && ['Add task line', () => onAddLine(p)],
      ['Edit project', () => onEdit(p)],
      null,
      ['Move up', () => moveBy(p.id, -1), { disabled: !neighbour(p.id, -1) }],
      ['Move down', () => moveBy(p.id, 1), { disabled: !neighbour(p.id, 1) }],
      null,
      ['Remove project…', () => onRemove(p), { danger: true }],
    ].filter((item) => item !== false);
  return (
    <>
    <QuickEntryBar
      projects={allProjects}
      week={week}
      days={days}
      leave={leave}
      capacityByDay={capacityByDay}
      onEntry={onEntry}
      onTaskEntry={onTaskEntry}
      onSaveNote={onSaveNote}
      onUndo={onUndo}
      onCheckpoint={onCheckpoint}
    />
    <div className="table-scroll">
      <table
        style={{ width: widths.reduce((a, b) => a + b, 0), minWidth: '100%' }}
      >
        <colgroup>
          {columns.map(([id], i) => (
            <col
              key={id}
              className={
                !id.startsWith('day-')
                  ? ''
                  : [
                      weekDates(week)[Number(id.slice(4))].toDateString() ===
                        today && 'current-day',
                      Number(id.slice(4)) >= 5 && 'weekend',
                      leave.includes(Number(id.slice(4))) && 'leave-col',
                    ]
                      .filter(Boolean)
                      .join(' ')
              }
              style={{ width: widths[i] }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            <ColumnHeader column={columns[0]} sizing={sizing}>
              Project / task
            </ColumnHeader>
            {days.map((d, i) => {
              const date = weekDates(week)[d],
                off = leave.includes(d);
              return (
                <ColumnHeader
                  column={columns[i + 1]}
                  sizing={sizing}
                  key={d}
                  className={
                    off
                      ? 'leave'
                      : date.toDateString() === today
                        ? 'current-day'
                        : ''
                  }
                >
                  <button
                    className="leave-day-toggle"
                    onClick={() => onLeave(d)}
                    aria-pressed={off}
                    aria-label={`${off ? 'Remove' : 'Mark'} ${DAY_NAMES[d]} leave`}
                  >
                    {DAY_SHORT[d]} <b>{date.getDate()}</b>
                  </button>
                  <span className="day-load">
                    <i
                      style={{
                        width:
                          Math.min(
                            100,
                            (100 * dayTotal(d)) / (capacityByDay?.[d] || 1),
                          ) + '%',
                      }}
                    />
                  </span>
                  <small>
                    {off ? 'Leave' : fmt(capacityByDay?.[d] || 0) + 'h'}
                  </small>
                </ColumnHeader>
              );
            })}
            {columns.slice(-4).map((column) => (
              <ColumnHeader key={column[0]} column={column} sizing={sizing}>
                {column[0] === 'actions' ? (
                  <span className="sr-only">Actions</span>
                ) : (
                  column[1]
                )}
              </ColumnHeader>
            ))}
          </tr>
        </thead>
        <tbody
          ref={tbodyRef}
          className={dragging ? 'is-reordering' : undefined}
          onPointerDown={() => {
            pointerFocus.current = true;
            setTimeout(() => (pointerFocus.current = false), 0);
          }}
          onFocus={onCellFocus}
          onKeyDown={onCellKeyDown}
        >
          {groups.map((group) => (
            <Fragment key={group.key}>
              {category !== 'none' && (
                <tr className="timesheet-group-row">
                  <th colSpan={columnCount}>
                    {group.label}
                    <small>
                      {group.projects.length} project
                      {group.projects.length === 1 ? '' : 's'}
                    </small>
                  </th>
                </tr>
              )}
              {group.projects.map((p) => {
                const suggestion =
                  frontloadAdjustment(p, week, leaveWeeks) ||
                  frontloadSuggestion(p, week, leaveWeeks);
                return (
                  <Fragment key={p.id}>
                    <ProjectRow
                      hideClient={category === 'client'}
                      p={p}
                      week={week}
                      days={days}
                      leave={leave}
                      leaveWeeks={leaveWeeks}
                      suggestion={suggestion}
                      onEntry={onEntry}
                      onAddLine={() => onAddLine(p)}
                      onEdit={() => onEdit(p)}
                      onFrontload={() => onFrontload(p)}
                      onSuggestFrontload={() =>
                        onSuggestFrontload(p, suggestion)
                      }
                      overDays={overDaysFor(p)}
                      grip={gripFor(p)}
                      dragging={dragging === p.id}
                      onMenu={(event) =>
                        openMenu(event, projectMenu(p), `${p.name} options`)
                      }
                    />
                    {taskLinesFor(p, week).map((task, taskIndex, lines) => (
                      <TaskEntryRow
                        key={task.id}
                        project={p}
                        task={task}
                        week={week}
                        days={days}
                        leave={leave}
                        suggestion={suggestion}
                        onEntry={onTaskEntry}
                          onSuggestFrontload={() =>
                          onSuggestFrontload(p, suggestion)
                        }
                        dragging={
                          dragging === p.id || dragging === `${p.id}:${task.id}`
                        }
                        overDays={overDaysFor(p)}
                        grip={
                          lines.length > 1 &&
                          grip(taskList(p), task.id, `${task.name} line`)
                        }
                        onMenu={(event) =>
                          openMenu(
                            event,
                            [
                              [`Edit ${task.name}`, () => onEdit(p, task.id)],
                              ['Add task line', () => onAddLine(p)],
                              ['Edit project', () => onEdit(p)],
                              null,
                              [
                                'Move up',
                                () => moveIn(taskList(p), task.id, -1),
                                { disabled: taskIndex === 0 },
                              ],
                              [
                                'Move down',
                                () => moveIn(taskList(p), task.id, 1),
                                { disabled: taskIndex === lines.length - 1 },
                              ],
                              null,
                              [
                                `Remove ${task.name} line`,
                                () => onRemoveTaskLine(p.id, task.id),
                                { danger: true },
                              ],
                            ],
                            `${task.name} options`,
                          )
                        }
                      />
                    ))}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th>
              {projects.length === allProjects.length
                ? 'Whole week'
                : 'Filtered subtotal'}
              <small>
                {projects.length === allProjects.length
                  ? 'All scheduled work'
                  : `${projects.length} visible projects`}
              </small>
            </th>
            {days.map((day) => {
              const value = dayTotal(day),
                target = dailyTarget(day),
                pct = target ? Math.round((value / target) * 100) : 0,
                isOver = target > 0 && value > target + EPSILON;
              return (
                <td key={day} className={isOver ? 'over' : ''}>
                  {fmt(value)}h
                  <small>
                    {leave.includes(day)
                      ? 'Leave'
                      : target
                        ? `${pct}% of ${fmt(target)}h`
                        : '—'}
                  </small>
                </td>
              );
            })}
            <td
              className={`week-total${weekIsComplete(totals) ? ' is-complete' : ''}`}
            >
              <TickNumber
                value={projects.reduce(
                  (n, p) => n + projectMetrics(p, week, leaveWeeks).logged,
                  0,
                )}
                suffix="h"
              />
            </td>
            <td>—</td>
            <td className={over ? 'over' : ''}>
              {over
                ? `${fmt(-totals.remaining)}h over`
                : `${fmt(Math.max(0, totals.remaining))}h free`}
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
      <RowMenu
        open={menu}
        items={menu?.items || []}
        label={menu?.label}
        onClose={closeMenu}
      />
      {entryProject && (
        <EntryPopover
          key={`${entryTarget.projectId}|${entryTarget.taskId}|${entryTarget.day}`}
          target={entryTarget}
          project={entryProject}
          taskName={
            entryTarget.taskId
              ? entryProject.tasks?.find((t) => t.id === entryTarget.taskId)
                  ?.name || 'Task'
              : 'General'
          }
          week={week}
          gap={Math.max(
            0,
            Number(capacityByDay?.[entryTarget.day] || 0) -
              dayTotal(entryTarget.day),
          )}
          rootRef={tbodyRef}
          onSaveNote={(projectId, taskId, wk, day, text) =>
            onSaveNote
              ? onSaveNote(projectId, taskId, wk, day, text)
              : onNote?.(projectId, taskId, wk, day)
          }
          onSetHours={setEntryHours}
          onClose={closeEntry}
          onFinish={() => {
            const key = `${entryTarget.projectId}|${entryTarget.taskId ?? ''}|${entryTarget.day}`;
            setEntryTarget(null);
            refocusEntry(key);
          }}
          renderNoteExtras={renderNoteExtras}
        />
      )}
      <WeekCelebration week={week} totals={totals} />
    </div>
    </>
  );
}
