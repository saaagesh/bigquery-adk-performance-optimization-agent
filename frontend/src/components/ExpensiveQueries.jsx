import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Zap, Clock, User, ChevronDown, ChevronRight, Database, Eye, BarChart3, Target, Hash } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

import AIRecommendationsModal from './AIRecommendationsModal';
import ExecutionPlanViewer from './ExecutionPlanViewer';
import PerformanceInsightsViewer from './PerformanceInsightsViewer';
import './AIRecommendationsModal.css';
import './ExpensiveQueries.css';

const API_BASE = Config.API_BASE_URL;

const ExpensiveQueries = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [expensiveQueries, setExpensiveQueries] = useState(() => {
    const saved = localStorage.getItem('expensiveQueries_queries');
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedJobId, setSelectedJobId] = useState(() => {
    return localStorage.getItem('expensiveQueries_selectedJobId') || null;
  });
  const [queryDetails, setQueryDetails] = useState(() => {
    const saved = localStorage.getItem('expensiveQueries_queryDetails');
    return saved ? JSON.parse(saved) : null;
  });
  const [recommendations, setRecommendations] = useState(() => {
    return localStorage.getItem('expensiveQueries_recommendations') || '';
  });
  const [debugInfo, setDebugInfo] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState(new Set());
  const [activeTab, setActiveTab] = useState('overview');
  const [days, setDays] = useState(() => {
    const saved = localStorage.getItem('expensiveQueries_days');
    return saved ? JSON.parse(saved) : 1;
  });
  
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  useEffect(() => {
    localStorage.setItem('expensiveQueries_queries', JSON.stringify(expensiveQueries));
  }, [expensiveQueries]);

  useEffect(() => {
    if (selectedJobId) {
      localStorage.setItem('expensiveQueries_selectedJobId', selectedJobId);
    } else {
      localStorage.removeItem('expensiveQueries_selectedJobId');
    }
  }, [selectedJobId]);

  useEffect(() => {
    if (queryDetails) {
      localStorage.setItem('expensiveQueries_queryDetails', JSON.stringify(queryDetails));
    } else {
      localStorage.removeItem('expensiveQueries_queryDetails');
    }
  }, [queryDetails]);

  useEffect(() => {
    if (recommendations) {
      localStorage.setItem('expensiveQueries_recommendations', recommendations);
    } else {
      localStorage.removeItem('expensiveQueries_recommendations');
    }
  }, [recommendations]);

  useEffect(() => {
    localStorage.setItem('expensiveQueries_days', JSON.stringify(days));
  }, [days]);

  useEffect(() => {
    // Fetch queries only if the list is empty
    if (expensiveQueries.length === 0) {
      fetchExpensiveQueries();
    }
  }, [selectedProject, selectedRegion, days]);

  const toggleQueryExpansion = (jobId, event) => {
    event.stopPropagation();
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    setExpandedQueries(newExpanded);
  };

  const getQueryHash = (query) => {
    if (!query) return 'N/A';
    // Simple hash for query identification
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
  };



  const fetchExpensiveQueries = async () => {
    try {
      setLoadingQueries(true);
      setDebugInfo('');
      const response = await axios.get(`${API_BASE}/expensive-queries?project=${selectedProject}&region=${selectedRegion}&days=${days}`);
      
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
    console.log('=== QUERY SELECTED ===', jobId);
    
    if (selectedJobId === jobId) {
      setSelectedJobId(null);
      setQueryDetails(null);
      setRecommendations('');
      setActiveTab('overview');
      return;
    }

    setSelectedJobId(jobId);
    setRecommendations('');
    setActiveTab('overview');
    
    try {
      setLoadingDetails(true);
      console.log('=== FETCHING QUERY DETAILS ===');
      const response = await axios.post(`${API_BASE}/query-details`, { job_id: jobId });
      console.log('=== BACKEND RESPONSE ===', response.data);
      console.log('=== SELECTED QUERY FROM LIST ===', expensiveQueries.find(q => q.job_id === jobId));
      setQueryDetails(response.data);
    } catch (error) {
      console.error('=== ERROR FETCHING QUERY DETAILS ===', error);
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
        ddl: queryDetails.ddl || "",
        execution_plan: queryDetails.execution_plan || [],
        execution_plan_summary: queryDetails.execution_plan_summary || "",
        performance_insights: queryDetails.performance_insights || null
      });
      setRecommendations(response.data.recommendations);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      
      // Set error message as recommendations to show in modal
      let errorMessage = "**Error Getting AI Recommendations**\n\n";
      
      if (error.response?.data?.recommendations) {
        // Backend provided a formatted error message
        setRecommendations(error.response.data.recommendations);
      } else if (error.response?.data?.details) {
        errorMessage += `Details: ${error.response.data.details}\n\n`;
        errorMessage += "**Troubleshooting Steps:**\n";
        errorMessage += "1. Check that your Gemini API key is configured correctly\n";
        errorMessage += "2. Verify the backend service is running\n";
        errorMessage += "3. Check the browser console and backend logs for more details\n";
        errorMessage += "4. Ensure you have proper permissions for BigQuery and Gemini API";
        setRecommendations(errorMessage);
      } else {
        errorMessage += `Error: ${error.message}\n\n`;
        errorMessage += "**Common Issues:**\n";
        errorMessage += "- Backend service not running\n";
        errorMessage += "- Missing or invalid Gemini API key\n";
        errorMessage += "- Network connectivity issues\n";
        errorMessage += "- BigQuery permissions problems";
        setRecommendations(errorMessage);
      }
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleRefresh = () => {
    localStorage.removeItem('expensiveQueries_queries');
    localStorage.removeItem('expensiveQueries_selectedJobId');
    localStorage.removeItem('expensiveQueries_queryDetails');
    localStorage.removeItem('expensiveQueries_recommendations');
    localStorage.removeItem('expensiveQueries_days');
    setExpensiveQueries([]);
    setSelectedJobId(null);
    setQueryDetails(null);
    setRecommendations('');
    setDays(1);
    fetchExpensiveQueries();
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
          onRefresh={handleRefresh}
          loading={loadingQueries}
          showDaysFilter={true}
          days={days}
          onDaysChange={setDays}
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
              <strong>Note:</strong> {debugInfo}
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
              expensiveQueries.map((query, index) => {
                const isExpanded = expandedQueries.has(query.job_id);
                const queryHash = getQueryHash(query.query || query.query_preview);
                
                return (
                  <div 
                    key={query.job_id} 
                    className={`query-item ${selectedJobId === query.job_id ? 'selected' : ''} ${isExpanded ? 'expanded' : ''}`}
                  >
                    <div 
                      className="query-header"
                      onClick={() => handleQuerySelect(query.job_id)}
                    >
                      <div className="query-rank">
                        <span className="rank-number">#{index + 1}</span>
                        <Zap className="expense-icon" />
                      </div>
                      
                      <div className="query-identifier">
                        <div className="query-hash">
                          <Hash size={14} />
                          <span title="Query Hash: A unique identifier generated from the query structure to group similar queries">Query Hash: {queryHash}</span>
                        </div>
                        <div className="job-id">
                          <span className="job-id-label">Job ID:</span>
                          <span className="job-id-value">{query.job_id}</span>
                        </div>
                      </div>
                      
                      <div className="query-cost">
                        <span className="slot-ms">{query.total_slot_ms.toLocaleString()}</span>
                        <span className="slot-label">slot ms</span>
                      </div>
                      
                      <button 
                        className="expand-toggle"
                        onClick={(e) => toggleQueryExpansion(query.job_id, e)}
                        title={isExpanded ? 'Collapse details' : 'Expand details'}
                      >
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
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
                        <Database size={14} />
                        <span>{query.project_id}</span>
                      </div>
                      {query.duration_seconds && (
                        <div className="query-duration">
                          <span>Duration: {query.duration_seconds}s</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="query-preview">
                      <div className="preview-header">
                        <span className="preview-label">Query Preview:</span>
                        <span className="expand-hint">Click {isExpanded ? 'chevron to collapse' : 'chevron to expand'} for full SQL</span>
                      </div>
                      <code>{query.query_preview || query.query?.substring(0, Config.MAX_QUERY_PREVIEW_LENGTH) || 'No preview available'}</code>
                    </div>
                    
                    {isExpanded && (
                      <div className="query-expanded-details">
                        <div className="expanded-sql-section">
                          <div className="sql-header">
                            <h5>Full SQL Query</h5>
                            <div className="query-id-display">
                              <span className="query-id-label">Query Hash:</span>
                              <span className="query-id-value">{queryHash}</span>
                            </div>
                          </div>
                          {query.query ? (
                            <pre className="query-code">{query.query}</pre>
                          ) : (
                            <div className="no-query-content">
                              <p>Full query content is not available. Showing preview:</p>
                              <pre className="query-code">{query.query_preview || 'No query content available'}</pre>
                            </div>
                          )}
                        </div>
                        
                        <div className="expanded-metrics">
                          <div className="metric">
                            <span className="metric-label">Bytes Processed:</span>
                            <span className="metric-value">{query.total_bytes_processed ? (query.total_bytes_processed / (1024*1024*1024)).toFixed(2) + ' GB' : 'N/A'}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Bytes Billed:</span>
                            <span className="metric-value">{query.total_bytes_billed ? (query.total_bytes_billed / (1024*1024*1024)).toFixed(2) + ' GB' : 'N/A'}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Job Type:</span>
                            <span className="metric-value">{query.job_type || 'N/A'}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">State:</span>
                            <span className="metric-value">{query.state || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
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
              <div className="details-header">
                <div className="details-title-section">
                  <h3>Query Analysis</h3>
                  <div className="query-identifiers">
                    <div className="query-id-badge">
                      <Hash size={14} />
                      <span>Query Hash: {getQueryHash(queryDetails?.query || expensiveQueries.find(q => q.job_id === selectedJobId)?.query)}</span>
                    </div>
                  </div>
                </div>
                <div className="job-id-display">
                  <span className="job-id-label">Job ID:</span>
                  <code className="job-id-code">{selectedJobId}</code>
                </div>
              </div>
              
              <div className="details-tabs">
                <button 
                  className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  <Eye size={16} />
                  Overview
                </button>
                <button 
                  className={`tab ${activeTab === 'execution' ? 'active' : ''}`}
                  onClick={() => setActiveTab('execution')}
                >
                  <BarChart3 size={16} />
                  Execution Plan
                </button>
                <button 
                  className={`tab ${activeTab === 'optimization' ? 'active' : ''}`}
                  onClick={() => setActiveTab('optimization')}
                >
                  <Zap size={16} />
                  Optimization
                </button>
              </div>
              
              <div className="tab-content">
                {console.log('Current activeTab:', activeTab)}
                {console.log('queryDetails object before tab content rendering:', queryDetails)}
                {activeTab === 'overview' && (
                  <div className="overview-tab">
                    <div className="performance-summary">
                      <h4>Query Performance Summary</h4>
                      <div className="summary-grid">
                        <div className="summary-item">
                          <span className="summary-label">Slot Milliseconds</span>
                          <span className="summary-value">{queryDetails.total_slot_ms?.toLocaleString() || 'N/A'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Duration</span>
                          <span className="summary-value">{queryDetails.duration_seconds ? queryDetails.duration_seconds + 's' : 'N/A'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Data Processed</span>
                          <span className="summary-value">{queryDetails.total_bytes_processed ? (queryDetails.total_bytes_processed / (1024*1024*1024)).toFixed(2) + ' GB' : 'N/A'}</span>
                        </div>
                        <div className="summary-item">
                          <span className="summary-label">Optimization Potential</span>
                          <span className="summary-value optimization-potential">20%</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="quick-insights">
                      <h4>Quick Insights</h4>
                      <div className="insight-item">
                        <span className="insight-label">Query complexity:</span>
                        <span className="insight-value">Complex</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">Resource risk level:</span>
                        <span className="insight-value">Low</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">Executed by:</span>
                        <span className="insight-value">{queryDetails.user_email || 'N/A'}</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">Project:</span>
                        <span className="insight-value">{queryDetails.project_id || selectedProject}</span>
                      </div>
                    </div>
                    
                    <div className="query-content">
                      <h4>Query Content</h4>
                      <div style={{background: '#f0f0f0', padding: '10px', marginBottom: '10px', fontSize: '12px'}}>
                        <strong>Debug Info:</strong><br/>
                        queryDetails.query: {queryDetails?.query ? 'YES' : 'NO'}<br/>
                        Selected Job ID: {selectedJobId}<br/>
                        Query from list: {expensiveQueries.find(q => q.job_id === selectedJobId)?.query ? 'YES' : 'NO'}<br/>
                        Query preview from list: {expensiveQueries.find(q => q.job_id === selectedJobId)?.query_preview ? 'YES' : 'NO'}
                      </div>
                      <pre className="sql-code">
                        {(() => {
                          console.log('=== RENDERING QUERY CONTENT ===');
                          console.log('queryDetails:', queryDetails);
                          console.log('selectedJobId:', selectedJobId);
                          
                          const selectedQuery = expensiveQueries.find(q => q.job_id === selectedJobId);
                          console.log('selectedQuery:', selectedQuery);
                          
                          if (queryDetails?.query) {
                            console.log('Using queryDetails.query');
                            return queryDetails.query;
                          }
                          
                          if (selectedQuery?.query) {
                            console.log('Using selectedQuery.query');
                            return selectedQuery.query;
                          }
                          
                          if (selectedQuery?.query_preview) {
                            console.log('Using selectedQuery.query_preview');
                            return selectedQuery.query_preview;
                          }
                          
                          console.log('No query content found');
                          return 'No query content available';
                        })()}
                      </pre>
                      
                      {(!queryDetails?.query) && (
                        <div className="query-note">
                          <p><strong>Note:</strong> Full query content may be available in the Optimization tab when you request AI recommendations.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {activeTab === 'execution' && (
                  <div className="execution-tab">
                    {console.log('Rendering ExecutionPlanViewer. queryDetails:', queryDetails)}
                    {console.log('Plan prop to ExecutionPlanViewer:', queryDetails?.execution_plan)}
                    <ExecutionPlanViewer plan={queryDetails.execution_plan} summary={queryDetails.execution_plan_summary} />
                  </div>
                )}
                
                {activeTab === 'optimization' && (
                  <div className="optimization-tab optimization-viewer">
                    <div className="optimization-header">
                      <h4>AI-Powered Optimization</h4>
                      <button
                        onClick={getOptimizationRecommendations}
                        disabled={loadingRecommendations}
                        className="optimize-btn"
                        title={!queryDetails.ddl ? 'DDL information not available, but recommendations can still be generated based on the query structure' : 'Get AI-powered optimization recommendations'}
                      >
                        {loadingRecommendations ? 'Analyzing...' : 'Get AI Recommendations'}
                      </button>
                    </div>
                    
                    <div className="optimization-content">
                      {recommendations ? (
                        <div className="recommendations-display">
                          <ReactMarkdown>{recommendations}</ReactMarkdown>
                        </div>
                      ) : (
                        <div className="no-recommendations">
                          <Zap size={48} />
                          <p>Click "Get AI Recommendations" to analyze this query and receive optimization suggestions</p>
                        </div>
                      )}
                      
                      {queryDetails.ddl && (
                        <div className="schema-section">
                          <h5>Referenced Tables Schema</h5>
                          <pre className="ddl-code">{queryDetails.ddl}</pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
