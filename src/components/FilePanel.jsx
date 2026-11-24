import Modal from './Modal.jsx';

const icon = (d) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
);
const ICONS = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  create: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14h6',
  save: 'M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM7 3v5h8V3M7 21v-7h10v7',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  backup: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  csv: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
  library: 'M4 5h4v14H4zM10 5h4v14h-4zM16 6l3.5-1 3 13.5-3.5 1z',
};

function Action({ name, title, primary, ...props }) {
  return (
    <button className={`file-action ${primary ? 'primary' : ''}`} {...props}>
      {icon(ICONS[name])}
      <strong>{title}</strong>
    </button>
  );
}

export default function FilePanel({
  attached,
  fileName,
  status,
  dirty,
  needsAttention = false,
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
      <section className={`active-file-card ${attached ? 'attached' : 'local'}`}>
        <svg className="file-glyph" viewBox="0 0 44 52" aria-hidden="true">
          <path className="sheet" d="M4 2h26l10 10v38H4z" />
          <path className="fold" d="M30 2v10h10" />
          <text x="9" y="40">JSON</text>
        </svg>
        <strong>{fileName || 'No JSON file attached'}</strong>
        <span className={`file-status ${dirty ? 'dirty' : ''}`}>{status}</span>
      </section>
      {!supported && (
        <p className="file-warning" role="status">
          Direct file access needs Chrome or Edge. Import and download still work.
        </p>
      )}
      {attached && needsAttention && (
        <p className="file-warning" role="status">
          Your changes are kept in this browser. Try Save now, or choose
          Reattach and save to pick the file again and write this workspace to
          it. Choosing an existing JSON instead replaces this workspace with
          the file&apos;s contents.
        </p>
      )}
      <div className="file-actions file-primary-actions">
        {attached && needsAttention && supported && (
          <Action
            name="save"
            primary
            title="Reattach and save"
            onClick={onCreate}
          />
        )}
        <Action
          name="open"
          primary={!(attached && needsAttention)}
          title="Choose existing JSON"
          onClick={onOpen}
        />
        <Action name="create" title="Create new TimeMaster.json" onClick={onCreate} />
        <Action
          name="save"
          title="Save now"
          onClick={onSaveNow}
          disabled={!attached || !(dirty || needsAttention)}
        />
        <Action name="refresh" title="Refresh from file" onClick={onRefresh} disabled={!attached} />
      </div>
      <h3 className="file-section-title">Copies</h3>
      <div className="file-actions file-secondary-actions">
        <Action name="backup" title="Download backup copy" onClick={onExport} />
        <Action name="csv" title="Export timesheet CSV" onClick={onExportCsv} />
        <Action name="library" title="Projects and archive" onClick={onManage} />
      </div>
    </Modal>
  );
}
