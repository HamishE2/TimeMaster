/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from 'react';
import { parseCSV } from '../lib/csvParser.js';
import { fmtHours } from '../lib/utils.js';
import { classifyProject } from '../lib/projectImport.js';

export default function ImportModal({
  isOpen,
  onClose,
  existingProjects,
  onImport,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [classified, setClassified] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const fileInputRef = useRef(null);

  // Reset on open/close
  // Reset transient preview state each time the dialog opens.
  useEffect(() => {
    if (isOpen) {
      setResult(null);
      setError(null);
      setClassified([]);
      setSelected(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const processText = useCallback(
    (text) => {
      setError(null);
      const parsed = parseCSV(text);

      if (parsed.error) {
        setError(parsed.error);
        setResult(null);
        setClassified([]);
        return;
      }

      if (!parsed.projects || parsed.projects.length === 0) {
        setError('No projects found in the file.');
        setResult(null);
        setClassified([]);
        return;
      }

      setResult(parsed);

      const items = parsed.projects.map((p) =>
        classifyProject(p, existingProjects, parsed.format, parsed.weekKey),
      );
      setClassified(items);

      // Auto-select new and update items
      const autoSelected = new Set();
      items.forEach((item, i) => {
        if (item.status === 'new' || item.status === 'update') {
          autoSelected.add(i);
        }
      });
      setSelected(autoSelected);
    },
    [existingProjects],
  );

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => processText(e.target.result);
      reader.readAsText(file);
    },
    [processText],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      handleFile(file);
    },
    [handleFile],
  );

  const toggleSelect = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleImport = () => {
    const toImport = classified.filter((_, i) => selected.has(i));
    if (toImport.length === 0) return;
    onImport(result, toImport);
    onClose();
  };

  if (!isOpen) return null;

  const newCount = classified.filter(
    (c, i) => c.status === 'new' && selected.has(i),
  ).length;
  const updateCount = classified.filter(
    (c, i) => c.status === 'update' && selected.has(i),
  ).length;
  const skipCount = classified.filter((c) => c.status === 'skip').length;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import CSV</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {/* Drop zone — always visible for re-upload */}
          <div
            className={`drop-zone${dragOver ? ' drop-zone-active' : ''}${result ? ' drop-zone-compact' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt,.tsv"
              style={{ display: 'none' }}
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {!result ? (
              <>
                <svg
                  className="drop-icon"
                  width="36"
                  height="36"
                  viewBox="0 0 36 36"
                  fill="none"
                >
                  <path
                    d="M18 6v16M12 16l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M6 22v6a2 2 0 002 2h20a2 2 0 002-2v-6"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <p className="drop-text">
                  Drop a CSV file here or click to browse
                </p>
                <p className="drop-hint">
                  Supports Resourcing and Timesheet CSV exports
                </p>
              </>
            ) : (
              <p className="drop-text-compact">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                  fill="none"
                  style={{ marginRight: 6, verticalAlign: -2 }}
                >
                  <path
                    d="M2 7l3.5 3.5L12 4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                File loaded — drop another to replace
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="import-error">
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{ marginRight: 8, flexShrink: 0 }}
              >
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M8 5v3M8 10.5v.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              {error}
            </div>
          )}

          {/* Preview table */}
          {classified.length > 0 && (
            <>
              <div className="import-meta">
                <span className="import-format-badge">
                  {result.format === 'resourcing'
                    ? '📊 Resourcing'
                    : '⏱️ Timesheet'}
                </span>
                {result.weekKey && (
                  <span className="import-week">Week of {result.weekKey}</span>
                )}
              </div>

              <div className="import-table-wrap">
                <table className="import-table">
                  <thead>
                    <tr>
                      <th className="import-th-check"></th>
                      <th className="import-th-status">Status</th>
                      <th className="import-th-name">Project</th>
                      {result.format === 'resourcing' ? (
                        <th className="import-th-hours">Resourced</th>
                      ) : (
                        <th className="import-th-hours">Total Hours</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {classified.map((item, i) => (
                      <tr
                        key={i}
                        className={`import-row import-row-${item.status}${selected.has(i) ? ' import-row-selected' : ''}`}
                        onClick={() =>
                          item.status !== 'skip' && toggleSelect(i)
                        }
                      >
                        <td className="import-td-check">
                          {item.status !== 'skip' && (
                            <input
                              type="checkbox"
                              checked={selected.has(i)}
                              onChange={() => toggleSelect(i)}
                              className="import-checkbox"
                            />
                          )}
                        </td>
                        <td className="import-td-status">
                          <span
                            className={`import-status-badge import-status-${item.status}`}
                          >
                            {item.status === 'new' && '🆕 New'}
                            {item.status === 'update' && '🔄 Update'}
                            {item.status === 'skip' && '⏭️ No change'}
                          </span>
                        </td>
                        <td className="import-td-name">{item.name}</td>
                        <td className="import-td-hours">
                          {result.format === 'resourcing' ? (
                            item.status === 'update' ? (
                              <span>
                                <span className="import-old-val">
                                  {fmtHours(item.existingHours)}h
                                </span>
                                <span className="import-arrow"> → </span>
                                <span className="import-new-val">
                                  {fmtHours(item.resourcedHours)}h
                                </span>
                              </span>
                            ) : (
                              `${fmtHours(item.resourcedHours)}h`
                            )
                          ) : (
                            `${fmtHours(item.totalHours)}h`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Summary */}
              <div className="import-summary">
                {newCount > 0 && (
                  <span className="import-summary-item import-summary-new">
                    {newCount} new
                  </span>
                )}
                {updateCount > 0 && (
                  <span className="import-summary-item import-summary-update">
                    {updateCount} update{updateCount > 1 ? 's' : ''}
                  </span>
                )}
                {skipCount > 0 && (
                  <span className="import-summary-item import-summary-skip">
                    {skipCount} unchanged
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          {classified.length > 0 && (
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={selected.size === 0}
            >
              Import {selected.size} project{selected.size !== 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
