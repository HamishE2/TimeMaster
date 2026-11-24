import { useEffect, useRef } from 'react';

export default function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    // Leave focus alone when a child (e.g. a text field) already took it.
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div
      className="scrim"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex="-1"
        ref={ref}
      >
        <div className="modal-head">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
