import { useEffect, useRef, useState } from 'react';

export default function Commands({ actions }) {
  const dialog = useRef(null);
  const search = useRef(null);
  const [query, setQuery] = useState('');
  const matches = actions.filter(([label]) =>
    label.toLowerCase().includes(query.trim().toLowerCase()),
  );
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
        Commands <kbd>Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="commands"
        aria-label="Workspace commands"
        onKeyDown={(event) => {
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
              if (event.key === 'Enter' && matches.length) run(matches[0][1]);
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
          {matches.map(([label, action]) => (
            <button key={label} onClick={() => run(action)}>
              {label}
            </button>
          ))}
          {!matches.length && <p>No matching commands</p>}
        </div>
      </dialog>
    </>
  );
}
