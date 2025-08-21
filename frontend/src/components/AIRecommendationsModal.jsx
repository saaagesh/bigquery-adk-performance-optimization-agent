import React from 'react';
import ReactMarkdown from 'react-markdown';
import { X } from 'lucide-react';

const AIRecommendationsModal = ({ recommendations, onClose, loading }) => {
  return (
    <div className="ai-recommendations-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>AI Optimization Recommendations</h2>
          <button onClick={onClose} className="close-button">
            <X size={24} />
          </button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="loader"></div>
          ) : (
            <ReactMarkdown>{recommendations}</ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIRecommendationsModal;
