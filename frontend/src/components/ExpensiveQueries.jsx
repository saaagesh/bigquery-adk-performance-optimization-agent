import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Zap, Clock, User } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

import AIRecommendationsModal from './AIRecommendationsModal';
import './AIRecommendationsModal.css';

const API_BASE = Config.API_BASE_URL;

const ExpensiveQueries = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [expensiveQueries, setExpensiveQueries] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [queryDetails, setQueryDetails] = useState(null);
  const [recommendations, setRecommendations] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  useEffect(() => {
    fetchExpensiveQueries();
  }, [selectedProject, selectedRegion]);



  const fetchExpensiveQueries = async () => {
    try {
      setLoadingQueries(true);
      setDebugInfo('');
      const response = await axios.get(`${API_BASE}/expensive-queries?project=${selectedProject}&region=${selectedRegion}`);
      
      if (response.data.debug) {
        setDebugInfo(response.data.debug);
      }
      
      setExpensiveQueries(response.data.queries || response.data || []);
      setSelectedJobId(null);
      setQueryDetails(null);
      setRecommendations('');
    } catch (error) {
      console.error('Error fetching queries:', error);
      setDebugInfo(`Error: ${error.response?.data?.message || error.message}`);
      setExpensiveQueries([]);
    } finally {
      setLoadingQueries(false);
    }
  };

  const handleQuerySelect = async (jobId) => {
    if (selectedJobId === jobId) {
      setSelectedJobId(null);
      setQueryDetails(null);
      setRecommendations('');
      return;
    }

    setSelectedJobId(jobId);
    setRecommendations('');
    
    try {
      setLoadingDetails(true);
      const response = await axios.post(`${API_BASE}/query-details`, { job_id: jobId });
      setQueryDetails(response.data);
    } catch (error) {
      console.error('Error fetching query details:', error);
      alert('Error fetching query details. Check the backend logs.');
      setQueryDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  const getOptimizationRecommendations = async () => {
    if (!queryDetails) return;
    
    setIsModalOpen(true);
    try {
      setLoadingRecommendations(true);
      const response = await axios.post(`${API_BASE}/optimize`, {
        query: queryDetails.query,
        ddl: queryDetails.ddl
      });
      setRecommendations(response.data.recommendations);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      alert('Error getting recommendations. Check the backend logs and your Gemini API key.');
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="expensive-queries">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>Expensive Queries</h2>
            <p>Identify and optimize your most resource-intensive queries</p>
          </div>
        </div>
        <FilterControls 
          onRefresh={fetchExpensiveQueries}
          loading={loadingQueries}
        />
      </div>

      <div className="queries-container">
        <div className="queries-section">
          <div className="section-header">
            <h3>Top 10 Most Expensive Queries</h3>
            <span className="query-count">{expensiveQueries.length} queries</span>
          </div>
          
          {debugInfo && (
            <div className="debug-info">
              <strong>Debug Info:</strong> {debugInfo}
            </div>
          )}
          
          <div className="queries-list">
            {loadingQueries ? (
              <div className="loader"></div>
            ) : expensiveQueries.length === 0 ? (
              <div className="empty-state">
                <Zap size={48} />
                <h3>No expensive queries found</h3>
                <p>Try adjusting the time range or check a different project. Queries may not be available if there's no recent activity.</p>
              </div>
            ) : (
              expensiveQueries.map((query, index) => (
                <div 
                  key={query.job_id} 
                  className={`query-item ${selectedJobId === query.job_id ? 'selected' : ''}`}
                  onClick={() => handleQuerySelect(query.job_id)}
                >
                  <div className="query-header">
                    <div className="query-rank">
                      <span className="rank-number">#{index + 1}</span>
                      <Zap className="expense-icon" />
                    </div>
                    <div className="query-cost">
                      <span className="slot-ms">{query.total_slot_ms.toLocaleString()}</span>
                      <span className="slot-label">slot ms</span>
                    </div>
                  </div>
                  
                  <div className="query-meta">
                    <div className="query-user">
                      <User size={14} />
                      <span>{query.user_email}</span>
                    </div>
                    <div className="query-time">
                      <Clock size={14} />
                      <span>{new Date(query.creation_time).toLocaleDateString()}</span>
                    </div>
                    <div className="query-project">
                      <span>Project: {query.project_id}</span>
                    </div>
                    {query.duration_seconds && (
                      <div className="query-duration">
                        <span>Duration: {query.duration_seconds}s</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="query-preview">
                    <code>{query.query_preview || query.query?.substring(0, Config.MAX_QUERY_PREVIEW_LENGTH) || 'No preview available'}</code>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="details-section">
          {!selectedJobId ? (
            <div className="placeholder">
              <Zap size={48} />
              <h3>Select a query to analyze</h3>
              <p>Choose a query from the list to see detailed analysis and optimization recommendations</p>
            </div>
          ) : loadingDetails ? (
            <div className="loader"></div>
          ) : queryDetails ? (
            <div className="query-details">
              <div className="section-header">
                <h3>Query Analysis</h3>
              </div>
              
              <div className="query-sql">
                <h4>SQL Query</h4>
                <pre className="sql-code">{queryDetails.query}</pre>
              </div>

              <div className="ddl-section">
                <h4>Referenced Tables Schema</h4>
                <pre className="ddl-code">{queryDetails.ddl || "No schema information available."}</pre>
              </div>

              <div className="recommendations-section">
                <div className="section-header">
                  <h4>AI Optimization Recommendations</h4>
                  <button 
                    onClick={getOptimizationRecommendations} 
                    disabled={loadingRecommendations || !queryDetails.ddl}
                    className="optimize-btn"
                  >
                    {loadingRecommendations ? 'Analyzing...' : 'Get AI Recommendations'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="error-placeholder">
              <h3>Unable to load query details</h3>
              <p>There was an error loading the details for the selected query.</p>
            </div>
          )}
        </div>
      </div>
      {isModalOpen && (
        <AIRecommendationsModal 
          recommendations={recommendations}
          onClose={handleCloseModal}
          loading={loadingRecommendations}
        />
      )}
    </div>
  );
};

export default ExpensiveQueries;