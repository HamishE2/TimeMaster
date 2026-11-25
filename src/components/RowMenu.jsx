import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Context menu for a timesheet row. Opens from the row's ⋯ button or a
// right-click, positioned at the pointer (or under the button) and kept on
// screen. Items are [label, onSelect, { danger, disabled }?], null for a
// divider, or [label, null, { heading: true }] for a small group heading. Closes on Escape, outside click, scroll or resize.
export default function RowMenu({ open, items, label, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const menu = ref.current.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(open.x, innerWidth - menu.width - pad)),
      top:
        open.y + menu.height + pad > innerHeight
          ? Math.max(pad, open.y - menu.height)
          : open.y,
    });
    ref.current.querySelector('button:not(:disabled)')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => onClose();
    const onDown = (event) => {
      if (!ref.current?.contains(event.target)) onClose();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, onClose]);

  if (!open) return null;

  const onKeyDown = (event) => {
    const buttons = [...ref.current.querySelectorAll('button:not(:disabled)')];
    const i = buttons.indexOf(document.activeElement);
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      onClose(true);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons.at(-1)?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      className="row-menu"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: open.x, top: open.y, visibility: 'hidden' }
      }
    >
      {items.map((item, i) =>
        item?.[2]?.heading ? (
          <small key={`heading-${item[0]}`} className="row-menu-heading">
            {item[0]}
          </small>
        ) : item ? (
          <button
            key={item[0]}
            type="button"
            role="menuitem"
            className={item[2]?.danger ? 'danger' : undefined}
            disabled={item[2]?.disabled}
            onClick={() => {
              onClose(true);
              item[1]();
            }}
          >
            {item[0]}
          </button>
        ) : (
          <hr key={`divider-${i}`} />
        ),
      )}
    </div>,
    // Inside the themed root so the menu picks up the active theme's tokens.
    document.querySelector('[data-theme]') || document.body,
  );
}
