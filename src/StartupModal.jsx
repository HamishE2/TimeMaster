import { useState } from 'react';
import { promptForBackupFile, promptForNewBackupFile } from './backupService';

export default function StartupModal({ onComplete }) {
  const [error, setError] = useState(null);

  const handleImport = async () => {
    try {
      const { fileHandle, data } = await promptForBackupFile();
      onComplete({ fileHandle, data });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  const handleScratch = async () => {
    try {
      const { fileHandle, data } = await promptForNewBackupFile();
      onComplete({ fileHandle, data });
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-header">
          <h2>Welcome to TimeMaster</h2>
        </div>
        <div className="modal-body">
          <p style={{ margin: '0 0 12px 0' }}>
            Would you like to load an existing JSON backup to resume your work, or start from scratch?
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
            If you load a backup, the app will automatically save your changes directly to that file.
          </p>

          {error && (
            <div className="import-error" style={{ marginTop: '16px' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{marginRight: 8, flexShrink: 0}}>
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M8 5v3M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              {error}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={handleScratch}>Start from scratch</button>
          <button className="btn btn-primary" onClick={handleImport}>Load Backup (.json)</button>
        </div>
      </div>
    </div>
  );
}
