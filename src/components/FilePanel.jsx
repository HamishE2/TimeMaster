import Modal from './Modal.jsx';

export default function FilePanel({
  attached,
  fileName,
  status,
  dirty,
  supported,
  onClose,
  onOpen,
  onCreate,
  onSaveNow,
  onRefresh,
  onExport,
  onExportCsv,
  onManage,
}) {
  return (
    <Modal title="TimeMaster file" onClose={onClose}>
      <section
        className={`active-file-card ${attached ? 'attached' : 'local'}`}
      >
        <span>Active file</span>
        <strong>{fileName || 'No JSON file attached'}</strong>
        <small>{status}</small>
      </section>
      {!supported && (
        <p className="file-warning" role="status">
          Direct read/write access requires a recent Chrome or Edge browser and
          this HTTPS site. You can still import and download JSON copies in
          other browsers.
        </p>
      )}
      <div className="file-actions file-primary-actions">
        <button className="primary" onClick={onOpen}>
          Choose existing JSON
        </button>
        <button onClick={onCreate}>Create new TimeMaster.json</button>
        <button onClick={onSaveNow} disabled={!attached || !dirty}>
          Save now
        </button>
        <button onClick={onRefresh} disabled={!attached}>
          Refresh from file
        </button>
      </div>
      <div className="file-actions file-secondary-actions">
        <button onClick={onExport}>Download backup copy</button>
        <button onClick={onExportCsv}>Export timesheet CSV</button>
        <button onClick={onManage}>Projects and archive</button>
      </div>
    </Modal>
  );
}
