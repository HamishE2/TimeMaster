import { useRef } from 'react';

const clamp = (value, min) => Math.round(Math.min(900, Math.max(min, value)));

export function ColumnHeader({ column, sizing, children, className }) {
  const [id, title, initial, minimum] = column;
  const drag = useRef(null);
  const width = sizing.widths[id] || initial;
  function resize(value) {
    sizing.change(id, clamp(value, minimum));
  }
  return (
    <th className={className} scope="col">
      {children}
      <span
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label={`Resize ${title} column`}
        aria-valuemin={minimum}
        aria-valuemax={900}
        aria-valuenow={width}
        title="Drag or use arrow keys to resize. Double-click to reset."
        className="column-handle"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { x: event.clientX, width };
        }}
        onPointerMove={(event) => {
          if (drag.current)
            resize(drag.current.width + event.clientX - drag.current.x);
        }}
        onLostPointerCapture={() => {
          drag.current = null;
          sizing.save();
        }}
        onDoubleClick={() => {
          resize(initial);
          sizing.save();
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
          event.preventDefault();
          resize(
            event.key === 'Home'
              ? initial
              : width + (event.key === 'ArrowRight' ? 12 : -12),
          );
          sizing.save();
        }}
      />
    </th>
  );
}
