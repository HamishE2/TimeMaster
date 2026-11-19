import { useEffect, useRef, useState } from 'react';

import { phasesOf } from '../lib/tasks.js';
import { projectStatus } from '../lib/projectGrouping.js';

export default function Commands({ projects, onProject, sections }) {
  const dialog = useRef(null);
  const search = useRef(null);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const projectCommands = projects
    .filter((p) => !p.archived && projectStatus(p.status) === 'active')
    .flatMap((project) => {
      const parent = [project.name, project.client, project.code]
        .filter(Boolean)
        .join(' ');
      return [
        {
          id: JSON.stringify([project.id]),
          label: project.name,
          detail: project.client,
          searchable: parent,
          run: () => onProject(project),
        },
        ...phasesOf(project).map((phase) => ({
          id: JSON.stringify([project.id, phase.id]),
          label: phase.name,
          detail: term ? project.name : '',
          phase: true,
          searchable: parent + ' ' + phase.name,
          run: () => onProject(project, phase.id),
        })),
      ];
    });
  const groups = [
    ['Active projects', projectCommands],
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
  const firstMatch = groups.find(([, items]) => items.length)?.[1][0];
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
      <button className="command-trigger" onClick={open}>
        <span aria-hidden="true">⌕</span>{' '}
        <span className="jump-label">Jump to anything</span>
        <span className="phone-jump">Commands</span> <kbd>Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="commands"
        aria-label="Workspace commands"
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
            aria-label="Find a command"
            placeholder="Find a command"
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
            aria-label="Close commands"
            onClick={() => dialog.current.close()}
          >
            ×
          </button>
        </header>
        <div className="command-list">
          {groups.map(
            ([title, items]) =>
              (items.length > 0 || (!term && title === 'Active projects')) && (
                <section key={title} aria-label={title}>
                  <h3>{title}</h3>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={item.phase ? 'phase-command' : undefined}
                      onClick={() => run(item.run)}
                    >
                      <span>{item.label}</span>
                      {item.detail && <small>{item.detail}</small>}
                    </button>
                  ))}
                  {!items.length && <p>No active projects</p>}
                </section>
              ),
          )}
          {!firstMatch && <p>No matching commands</p>}
        </div>
      </dialog>
    </>
  );
}
