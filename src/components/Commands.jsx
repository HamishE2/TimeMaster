import { useEffect, useRef, useState } from 'react';

import { phasesOf } from '../lib/tasks.js';
import { projectStatus } from '../lib/projectGrouping.js';

// 24px stroke icons for palette actions, keyed by label.
const ACTION_ICONS = {
  'Add line': 'M12 5v14M5 12h14',
  'Export timesheet CSV': 'M4 4h16v16H4zM4 10h16M10 4v16',
  'Capacity breakdown': 'M5 20V10M12 20V4M19 20v-7',
  'Previous week': 'M15 6l-6 6 6 6',
  'Next week': 'M9 6l6 6-6 6',
  Today: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M11 14h2v2h-2z',
  'New project': 'M4 4h16v16H4zM12 8v8M8 12h8',
  'Manage projects': 'M4 5h4v14H4zM10 5h4v14h-4zM16 6l3.5-1 3 13.5-3.5 1z',
  Import: 'M12 15V3M7 8l5-5 5 5M4 15v5h16v-5',
  File: 'M14 3H6v18h12V7zM14 3v4h4',
  'Save now': 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  'Workspace settings': 'M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6',
};
const ActionIcon = ({ label }) =>
  ACTION_ICONS[label] ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={ACTION_ICONS[label]} />
    </svg>
  ) : null;

export default function Commands({ projects, onProject, sections }) {
  const dialog = useRef(null);
  const search = useRef(null);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  // A project card shows when its name/client/code or any phase matches; when the
  // project itself matches, all its phases stay visible.
  const projectCards = projects
    .filter((p) => !p.archived && projectStatus(p.status) === 'active')
    .map((project) => {
      const parent = [project.name, project.client, project.code]
        .filter(Boolean)
        .join(' ');
      const parentMatch = ('active projects ' + parent).toLowerCase().includes(term);
      const phases = phasesOf(project)
        .filter(
          (phase) => parentMatch || phase.name.toLowerCase().includes(term),
        )
        .map((phase) => ({
          id: phase.id,
          label: phase.name,
          run: () => onProject(project, phase.id),
        }));
      return {
        project,
        visible: parentMatch || phases.length > 0,
        // Enter on the search runs this: the phase itself when only a phase matched.
        best: parentMatch ? { run: () => onProject(project) } : phases[0],
        run: () => onProject(project),
        phases,
      };
    })
    .filter((card) => card.visible);
  const groups = [
    ...sections.map(([title, actions]) => [
      title,
      actions.map(([label, run]) => ({
        id: label,
        label,
        run,
        searchable: label,
      })),
    ]),
  ].map(([title, items]) => [
    title,
    items.filter((item) =>
      (title + ' ' + item.searchable).toLowerCase().includes(term),
    ),
  ]);
  const firstMatch = projectCards[0]?.best || groups.find(([, items]) => items.length)?.[1][0];
  function open() {
    if (
      document.querySelector(
        '.modal-backdrop, .scrim, [role="dialog"], dialog[open]',
      )
    )
      return;
    setQuery('');
    dialog.current.showModal();
    search.current.focus();
  }
  function run(action) {
    dialog.current.close();
    action();
  }
  useEffect(() => {
    function shortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open();
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return (
    <>
      <button className="command-trigger" onClick={open} aria-label="Search (Ctrl K)">
        <svg className="search-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="jump-label">Search</span>
        <span className="phone-jump">Search</span> <kbd>Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="commands"
        aria-label="Search"
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            event.target.matches('.command-list button')
          ) {
            event.preventDefault();
            event.target.click();
            return;
          }
          const items = [
            ...dialog.current.querySelectorAll('.command-list button'),
          ];
          if (!items.length || !['ArrowDown', 'ArrowUp'].includes(event.key))
            return;
          event.preventDefault();
          const index = items.indexOf(document.activeElement);
          items[
            (index < 0 && event.key === 'ArrowUp'
              ? items.length - 1
              : index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
              items.length
          ].focus();
        }}
      >
        <header>
          <input
            ref={search}
            aria-label="Search projects and actions"
            placeholder="Search projects and actions"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && firstMatch) {
                event.preventDefault();
                run(firstMatch.run);
              }
            }}
          />
          <button
            aria-label="Close search"
            onClick={() => dialog.current.close()}
          >
            ×
          </button>
        </header>
        <div className="command-list">
          <section aria-label="Active projects">
            <h3>Active projects</h3>
            {projectCards.length ? (
              <div className="command-projects">
                {projectCards.map(({ project, run: openProject, phases }) => (
                  <div className="command-project" key={project.id}>
                    <button
                      className="command-project-main"
                      style={{ "--pc": project.color }}
                      onClick={() => run(openProject)}
                    >
                      <span className="punch" aria-hidden="true" />
                      <span>{project.name}</span>
                      {project.client && <small>{project.client}</small>}
                    </button>
                    {phases.length > 0 && (
                      <div className="command-phases" aria-label={`${project.name} phases`}>
                        {phases.map((phase) => (
                          <button
                            key={phase.id}
                            className="phase-command"
                            aria-label={`${project.name}: ${phase.label}`}
                            onClick={() => run(phase.run)}
                          >
                            {phase.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p>{term ? "No matching projects" : "No active projects"}</p>
            )}
          </section>
          {groups.map(
            ([title, items]) =>
              items.length > 0 && (
                <section key={title} aria-label={title}>
                  <h3>{title}</h3>
                  <div className="command-actions">
                    {items.map((item) => (
                      <button key={item.id} onClick={() => run(item.run)}>
                        <ActionIcon label={item.label} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ),
          )}
          {!firstMatch && <p>No matches</p>}
        </div>
      </dialog>
    </>
  );
}
