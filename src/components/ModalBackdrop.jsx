import { useRef } from 'react';

export default function ModalBackdrop({ children, onClose }) {
  const pressedBackdrop = useRef(false);

  return (
    <div
      className="modal-backdrop"
      onPointerDown={(event) => {
        pressedBackdrop.current =
          event.button === 0 && event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        if (event.target !== event.currentTarget) {
          pressedBackdrop.current = false;
        }
      }}
      onPointerCancel={() => {
        pressedBackdrop.current = false;
      }}
      onClick={(event) => {
        const dismiss =
          pressedBackdrop.current && event.target === event.currentTarget;
        pressedBackdrop.current = false;
        if (dismiss) onClose();
      }}
    >
      {children}
    </div>
  );
}
