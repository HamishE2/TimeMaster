import Modal from './Modal.jsx';

export default function ConfirmAction({ confirmation, onClose }) {
  return (
    <Modal title={confirmation.title} onClose={onClose}>
      <p className="help">{confirmation.text}</p>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className={confirmation.danger ? 'danger primary' : 'primary'}
          onClick={() => {
            confirmation.action();
            onClose();
          }}
        >
          {confirmation.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
