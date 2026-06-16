import React, { useState, useEffect, useRef } from 'react';
import { useModelLoader, modelCache } from '../../src/index';

const TEST_FILES = [
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json',
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt',
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json'
];

// Valid SHA-256 hash for tokenizer_config.json (1.2KB)
const VALID_HASHES: Record<string, string> = {
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json': '9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3',
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/vocab.txt': '07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3',
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json': 'da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0'
};

const INVALID_HASHES: Record<string, string> = {
  'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer_config.json': 'invalid_hash_for_testing'
};

export default function App() {
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [loadStartTime, setLoadStartTime] = useState<number | null>(null);
  const [loadDuration, setLoadDuration] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<'none' | 'valid' | 'invalid'>('none');
  const [verifyOnLoad, setVerifyOnLoad] = useState(false);
  const [storageBackend, setStorageBackend] = useState<'cache' | 'opfs'>('opfs');
  const [enableLRU, setEnableLRU] = useState(false);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  const {
    isReady,
    isDownloading,
    progress,
    overallProgress,
    error,
    startDownload,
    cancel,
    clear,
    enforceQuota
  } = useModelLoader(TEST_FILES, {
    autoStart: false,
    hashes,
    verifyOnLoad,
    storageBackend,
    maxCacheQuota: enableLRU ? 2 * 1024 * 1024 : undefined // 2MB quota forces LRU eviction
  });

  const handleStart = (preset: 'none' | 'valid' | 'invalid') => {
    let selectedHashes = {};
    if (preset === 'valid') {
      selectedHashes = VALID_HASHES;
      addLog('Starting download with SHA-256 hash checks enabled...');
    } else if (preset === 'invalid') {
      selectedHashes = INVALID_HASHES;
      addLog('Starting download with an invalid SHA-256 hash to test error catching...');
    } else {
      addLog('Starting download with no hash checks (caching only)...');
    }

    setHashes(selectedHashes);
    setSelectedPreset(preset);
    setLoadStartTime(performance.now());
    setLoadDuration(null);
  };

  // Run startDownload after state resolves
  useEffect(() => {
    if (loadStartTime !== null) {
      startDownload();
    }
  }, [hashes, startDownload]);

  // Track finished load
  useEffect(() => {
    if (isReady && loadStartTime) {
      const duration = (performance.now() - loadStartTime) / 1000;
      setLoadDuration(duration);
      addLog(`✨ Caching completed in ${duration.toFixed(2)}s!`);
      setLoadStartTime(null);
    }
  }, [isReady]);

  // Track error logs
  useEffect(() => {
    if (error) {
      addLog(`❌ Error: ${error.message}`);
      setLoadStartTime(null);
    }
  }, [error]);

  const handleClear = async () => {
    await clear();
    addLog('🧹 Cache cleared for test files.');
    setLoadDuration(null);
  };

  const checkCacheStatus = async () => {
    const statuses = await Promise.all(
      TEST_FILES.map(async (url) => {
        const isCached = await modelCache.has(url);
        const name = url.split('/').pop();
        return `${name}: ${isCached ? '🟢 Cached' : '🔴 Missing'}`;
      })
    );
    addLog(`Cache Status: ${statuses.join(' | ')}`);
  };

  return (
    <div className="container">
      <header>
        <span className="badge">NPM PACKAGE WORKSPACE</span>
        <h1>browser-llm-cache</h1>
        <p className="subtitle">
          Streaming, memory-safe, hash-verified cache for client-side WebGPU & AI assets.
        </p>
      </header>

      <div className="grid">
        {/* Controls Card */}
        <section className="card">
          <h2>Test Environment</h2>
          <p className="card-desc">
            Downloads a tokenizer (~2MB total) from HuggingFace to test low-RAM streaming caching and cryptographic integrity checks.
          </p>

          <div className="button-group">
            <button
              onClick={() => handleStart('none')}
              disabled={isDownloading}
              className="btn btn-primary"
            >
              🚀 Download (Standard Caching)
            </button>
            <button
              onClick={() => handleStart('valid')}
              disabled={isDownloading}
              className="btn btn-secondary"
            >
              🔒 Download + Verify Hashes
            </button>
            <button
              onClick={() => handleStart('invalid')}
              disabled={isDownloading}
              className="btn btn-danger"
            >
              ⚠️ Test Hash Mismatch (Corrupt)
            </button>
          </div>

          <div className="settings">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={verifyOnLoad}
                onChange={(e) => setVerifyOnLoad(e.target.checked)}
              />
              <span className="checkmark"></span>
              Force verify SHA-256 on cache hit
            </label>
            <label className="checkbox-container" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={storageBackend === 'opfs'}
                onChange={(e) => setStorageBackend(e.target.checked ? 'opfs' : 'cache')}
              />
              <span className="checkmark"></span>
              Use OPFS Storage Backend (Required for Resumable Downloads)
            </label>
            <label className="checkbox-container" style={{ marginTop: '0.5rem' }}>
              <input
                type="checkbox"
                checked={enableLRU}
                onChange={(e) => setEnableLRU(e.target.checked)}
              />
              <span className="checkmark"></span>
              Enable LRU Eviction (2MB Quota Limit)
            </label>
          </div>

          <div className="divider"></div>

          <div className="cache-actions">
            <button onClick={checkCacheStatus} className="btn btn-outline">
              🔍 Check Local Cache
            </button>
            <button onClick={handleClear} className="btn btn-outline btn-clear">
              🧹 Empty Cache
            </button>
            {enableLRU && (
              <button onClick={() => enforceQuota().then(b => addLog(`🧹 LRU Manager freed ${b / 1024} KB`))} className="btn btn-outline">
                🗑️ Run LRU Eviction
              </button>
            )}
          </div>
        </section>

        {/* Progress Card */}
        <section className="card progress-card">
          <h2>Progress Monitor</h2>

          {isDownloading || isReady ? (
            <div className="progress-details">
              <div className="stat-row">
                <span className="stat-label">Overall Progress</span>
                <span className="stat-value">{overallProgress.percentage.toFixed(1)}%</span>
              </div>

              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill animate-pulse"
                  style={{ width: `${overallProgress.percentage}%` }}
                ></div>
              </div>

              <div className="meta-stats">
                <div>
                  <span className="meta-label">Speed</span>
                  <span className="meta-val">
                    {(overallProgress.speed / 1024).toFixed(1)} KB/s
                  </span>
                </div>
                <div>
                  <span className="meta-label">Downloaded</span>
                  <span className="meta-val">
                    {(overallProgress.loaded / 1024).toFixed(1)} KB /{' '}
                    {(overallProgress.total / 1024).toFixed(1)} KB
                  </span>
                </div>
              </div>

              <div className="file-list">
                <h3>Asset Details</h3>
                {TEST_FILES.map((url) => {
                  const name = url.split('/').pop() || '';
                  const fileProgress = progress[url];
                  const percentage = fileProgress?.percentage || 0;
                  return (
                    <div key={url} className="file-item">
                      <div className="file-header">
                        <span className="file-name">{name}</span>
                        <span className="file-percent">{percentage.toFixed(0)}%</span>
                      </div>
                      <div className="file-bar-bg">
                        <div
                          className="file-bar-fill"
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isDownloading && (
                <button onClick={cancel} className="btn btn-danger btn-cancel">
                  🛑 Cancel Download
                </button>
              )}
            </div>
          ) : (
            <div className="idle-state">
              <div className="idle-icon">💤</div>
              <p>No active downloads. Press one of the buttons on the left to start.</p>
            </div>
          )}

          {isReady && loadDuration && (
            <div className="success-banner">
              <h3>🎉 Success!</h3>
              <p>
                All model assets are stored and ready. Cache load completed in{' '}
                <strong>{loadDuration.toFixed(2)}s</strong>.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Logs Card */}
      <section className="card logs-card">
        <div className="logs-header">
          <h2>Execution Logs</h2>
          <button onClick={() => setLogs([])} className="btn-text">
            Clear Logs
          </button>
        </div>
        <div className="logs-container">
          {logs.length === 0 ? (
            <span className="logs-empty">Logs console is empty. Activity will show here.</span>
          ) : (
            logs.map((log, i) => <div key={i} className="log-line">{log}</div>)
          )}
        </div>
      </section>

      <style>{`
        :root {
          --bg: #0b0c10;
          --card-bg: rgba(22, 24, 37, 0.7);
          --card-border: rgba(99, 102, 241, 0.15);
          --primary: #6366f1;
          --primary-hover: #4f46e5;
          --secondary: #8b5cf6;
          --secondary-hover: #7c3aed;
          --danger: #ef4444;
          --danger-hover: #dc2626;
          --text: #f3f4f6;
          --text-muted: #9ca3af;
          --success: #10b981;
        }

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          background-color: var(--bg);
          color: var(--text);
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          background-image: 
            radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.1) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.1) 0px, transparent 50%);
          padding: 2rem 1rem;
        }

        .container {
          max-width: 1100px;
          margin: 0 auto;
        }

        header {
          text-align: center;
          margin-bottom: 3rem;
        }

        .badge {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          background: rgba(99, 102, 241, 0.15);
          color: var(--primary);
          padding: 0.4rem 0.8rem;
          border-radius: 9999px;
          border: 1px solid rgba(99, 102, 241, 0.3);
          margin-bottom: 1rem;
        }

        h1 {
          font-size: 2.75rem;
          font-weight: 800;
          background: linear-gradient(135deg, #a5b4fc, #6366f1, #c084fc);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin-bottom: 0.5rem;
        }

        .subtitle {
          color: var(--text-muted);
          font-size: 1.125rem;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        .card {
          background: var(--card-bg);
          border: 1px solid var(--card-border);
          border-radius: 16px;
          padding: 2rem;
          backdrop-filter: blur(12px);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
        }

        .card h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.75rem;
          background: linear-gradient(to right, #ffffff, #c7d2fe);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .card-desc {
          color: var(--text-muted);
          font-size: 0.925rem;
          line-height: 1.5;
          margin-bottom: 2rem;
        }

        .button-group {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .btn {
          width: 100%;
          padding: 0.85rem 1.5rem;
          border-radius: 8px;
          border: none;
          font-family: inherit;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          transition: all 0.2s ease-in-out;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-primary {
          background: var(--primary);
          color: white;
          box-shadow: 0 4px 14px 0 rgba(99, 102, 241, 0.4);
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--primary-hover);
          transform: translateY(-1px);
        }

        .btn-secondary {
          background: var(--secondary);
          color: white;
          box-shadow: 0 4px 14px 0 rgba(139, 92, 246, 0.4);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--secondary-hover);
          transform: translateY(-1px);
        }

        .btn-danger {
          background: var(--danger);
          color: white;
          box-shadow: 0 4px 14px 0 rgba(239, 68, 68, 0.4);
        }

        .btn-danger:hover:not(:disabled) {
          background: var(--danger-hover);
          transform: translateY(-1px);
        }

        .settings {
          margin-bottom: 1.5rem;
        }

        .checkbox-container {
          display: flex;
          align-items: center;
          position: relative;
          padding-left: 2rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: var(--text-muted);
          user-select: none;
        }

        .checkbox-container input {
          position: absolute;
          opacity: 0;
          cursor: pointer;
          height: 0;
          width: 0;
        }

        .checkmark {
          position: absolute;
          top: 0;
          left: 0;
          height: 1.25rem;
          width: 1.25rem;
          background-color: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 4px;
        }

        .checkbox-container input:checked ~ .checkmark {
          background-color: var(--primary);
          border-color: var(--primary);
        }

        .checkmark:after {
          content: "";
          position: absolute;
          display: none;
          left: 6px;
          top: 3px;
          width: 4px;
          height: 8px;
          border: solid white;
          border-width: 0 2px 2px 0;
          transform: rotate(45deg);
        }

        .checkbox-container input:checked ~ .checkmark:after {
          display: block;
        }

        .divider {
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin: 1.5rem 0;
        }

        .cache-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .btn-outline {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: var(--text);
        }

        .btn-outline:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.3);
        }

        .btn-clear:hover {
          color: var(--danger);
          border-color: rgba(239, 68, 68, 0.4);
        }

        /* Progress Bar styling */
        .progress-details {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .stat-row {
          display: flex;
          justify-content: space-between;
          font-weight: 600;
        }

        .stat-value {
          color: var(--primary);
        }

        .progress-bar-bg {
          width: 100%;
          height: 12px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 9999px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .progress-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary), var(--secondary));
          border-radius: 9999px;
          transition: width 0.1s ease-out;
        }

        .meta-stats {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          color: var(--text-muted);
        }

        .meta-label {
          display: block;
          margin-bottom: 0.25rem;
        }

        .meta-val {
          font-weight: 600;
          color: var(--text);
        }

        .file-list {
          margin-top: 1rem;
        }

        .file-list h3 {
          font-size: 0.9rem;
          color: var(--text-muted);
          margin-bottom: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .file-item {
          margin-bottom: 0.75rem;
        }

        .file-header {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          margin-bottom: 0.25rem;
        }

        .file-name {
          color: var(--text-muted);
          font-family: 'JetBrains Mono', monospace;
        }

        .file-percent {
          font-weight: 600;
        }

        .file-bar-bg {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.03);
          border-radius: 9999px;
          overflow: hidden;
        }

        .file-bar-fill {
          height: 100%;
          background: var(--primary);
          opacity: 0.8;
          border-radius: 9999px;
          transition: width 0.15s ease-out;
        }

        .btn-cancel {
          margin-top: 1rem;
        }

        .idle-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 250px;
          color: var(--text-muted);
          text-align: center;
          gap: 1rem;
        }

        .idle-icon {
          font-size: 3rem;
        }

        .success-banner {
          margin-top: 1.5rem;
          padding: 1rem 1.5rem;
          background: rgba(16, 185, 129, 0.1);
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 8px;
          color: var(--text);
        }

        .success-banner h3 {
          color: var(--success);
          margin-bottom: 0.25rem;
        }

        /* Logs Card */
        .logs-card {
          grid-column: span 2;
        }

        @media (max-width: 768px) {
          .logs-card {
            grid-column: span 1;
          }
        }

        .logs-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .btn-text {
          background: none;
          border: none;
          color: var(--primary);
          font-family: inherit;
          font-weight: 600;
          cursor: pointer;
        }

        .btn-text:hover {
          color: var(--primary-hover);
        }

        .logs-container {
          background: #06070a;
          border-radius: 8px;
          padding: 1.25rem;
          height: 200px;
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.825rem;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .log-line {
          margin-bottom: 0.4rem;
          color: #818cf8;
          white-space: pre-wrap;
          line-height: 1.4;
        }

        .log-line:last-child {
          margin-bottom: 0;
        }

        .logs-empty {
          color: var(--text-muted);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
