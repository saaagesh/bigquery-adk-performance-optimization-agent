import React from 'react';
import { X, Copy } from 'lucide-react';
import './ExpensiveQueries.css'; // Reusing styles for consistency

const QueryModal = ({ query, isOpen, onClose }) => {
  if (!isOpen || !query) {
    return null;
  }

  const copyToClipboard = () => {
    if (query.query) {
      navigator.clipboard.writeText(query.query);
      // Optional: Add a toast notification here to confirm copy
    }
  };

  return (
    <div className="query-modal-backdrop" onClick={onClose}>
      <div className="query-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="query-modal-header">
          <h3>Full SQL Query</h3>
          <button onClick={onClose} className="close-btn">
            <X size={20} />
          </button>
        </div>
        <div className="query-modal-body">
          <div className="query-id-display" style={{ marginBottom: '16px' }}>
            <span className="query-id-label">Job ID:</span>
            <span className="query-id-value">{query.job_id}</span>
          </div>
          <pre className="query-code" style={{ maxHeight: '60vh' }}>
            {query.query || 'No query text available.'}
          </pre>
        </div>
        <div className="query-modal-footer">
          <button onClick={copyToClipboard} className="btn-secondary" disabled={!query.query}>
            <Copy size={16} />
            Copy SQL
          </button>
          <button onClick={onClose} className="btn-primary" style={{ marginLeft: '10px' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default QueryModal;
