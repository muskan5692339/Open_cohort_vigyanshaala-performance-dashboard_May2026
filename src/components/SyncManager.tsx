import React, { useState, useEffect } from 'react';
import {
  syncAttendanceFromExcel,
  syncAssignmentsFromExcel,
  syncQuizFromExcel,
  getSyncHistory,
  getSyncStats,
} from '../services/ondriveSync';
import type { SyncResult, SyncLog } from '../services/ondriveSync';
import '../styles/SyncManager.css';

export default function SyncManager() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncHistory, setSyncHistory] = useState<SyncLog[]>([]);
  const [syncStats, setSyncStats] = useState<any>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    loadSyncHistory();
    loadSyncStats();
  }, []);

  const loadSyncHistory = async () => {
    try {
      const history = await getSyncHistory();
      setSyncHistory(history);
    } catch (err: any) {
      setError('Failed to load sync history: ' + err.message);
    }
  };

  const loadSyncStats = async () => {
    try {
      const stats = await getSyncStats();
      setSyncStats(stats);
    } catch (err: any) {
      console.error('Failed to load sync stats:', err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setSelectedFile(e.target.files[0]);
      setError('');
      setSyncResult(null);
    }
  };

  const handleSync = async (syncType: 'Attendance' | 'Assignments' | 'Quiz') => {
    if (!selectedFile) {
      setError('Please select an Excel file');
      return;
    }

    setSyncing(true);
    setError('');
    setSyncResult(null);

    try {
      let result: SyncResult;

      switch (syncType) {
        case 'Attendance':
          result = await syncAttendanceFromExcel(selectedFile);
          break;
        case 'Assignments':
          result = await syncAssignmentsFromExcel(selectedFile);
          break;
        case 'Quiz':
          result = await syncQuizFromExcel(selectedFile);
          break;
      }

      setSyncResult(result);
      setSelectedFile(null);
      loadSyncHistory();
      loadSyncStats();
    } catch (err: any) {
      setError(err.message || 'Sync failed');
      setSyncResult(null);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="sync-manager">
      <div className="sync-container">
        <h2>📊 Data Sync from OneDrive</h2>

        {/* File Upload Section */}
        <div className="upload-section">
          <h3>Step 1: Upload Excel File</h3>
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              disabled={syncing}
            />
            {selectedFile && (
              <p className="file-selected">✓ {selectedFile.name} selected</p>
            )}
          </div>
        </div>

        {/* Sync Buttons Section */}
        <div className="sync-buttons">
          <h3>Step 2: Select Sync Type</h3>
          <div className="button-group">
            <button
              onClick={() => handleSync('Attendance')}
              disabled={!selectedFile || syncing}
              className="btn btn-attendance"
            >
              {syncing ? 'Syncing...' : '📝 Sync Attendance'}
            </button>
            <button
              onClick={() => handleSync('Assignments')}
              disabled={!selectedFile || syncing}
              className="btn btn-assignments"
            >
              {syncing ? 'Syncing...' : '📋 Sync Assignments'}
            </button>
            <button
              onClick={() => handleSync('Quiz')}
              disabled={!selectedFile || syncing}
              className="btn btn-quiz"
            >
              {syncing ? 'Syncing...' : '🧪 Sync Quiz'}
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && <div className="alert alert-error">{error}</div>}

        {/* Result Display */}
        {syncResult && (
          <div className={`alert ${syncResult.success ? 'alert-success' : 'alert-warning'}`}>
            <strong>{syncResult.message}</strong>
            <ul>
              <li>Inserted: {syncResult.stats.inserted}</li>
              <li>Updated: {syncResult.stats.updated}</li>
              <li>Failed: {syncResult.stats.failed}</li>
              <li>Duplicates Prevented: {syncResult.stats.duplicates_prevented}</li>
            </ul>
          </div>
        )}

        {/* Stats Section */}
        {syncStats && (
          <div className="stats-section">
            <h3>📈 Sync Statistics</h3>
            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-value">{syncStats.totalSyncs}</span>
                <span className="stat-label">Total Syncs</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{syncStats.successfulSyncs}</span>
                <span className="stat-label">Successful</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{syncStats.totalRowsProcessed}</span>
                <span className="stat-label">Rows Processed</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{syncStats.totalRowsInserted}</span>
                <span className="stat-label">Rows Inserted</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{syncStats.totalRowsUpdated}</span>
                <span className="stat-label">Rows Updated</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">{syncStats.totalRowsFailed}</span>
                <span className="stat-label">Failed</span>
              </div>
            </div>
          </div>
        )}

        {/* Sync History */}
        {syncHistory.length > 0 && (
          <div className="history-section">
            <h3>📜 Recent Sync History</h3>
            <table className="sync-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>File</th>
                  <th>Processed</th>
                  <th>Inserted</th>
                  <th>Updated</th>
                  <th>Failed</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.slice(0, 10).map((log, idx) => (
                  <tr key={idx}>
                    <td>{log.sync_type}</td>
                    <td>{log.file_name}</td>
                    <td>{log.rows_processed}</td>
                    <td>{log.rows_inserted}</td>
                    <td>{log.rows_updated}</td>
                    <td>{log.rows_failed}</td>
                    <td>
                      <span
                        className={`status-badge status-${log.sync_status.toLowerCase()}`}
                      >
                        {log.sync_status}
                      </span>
                    </td>
                    <td>{new Date(log.synced_at!).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
