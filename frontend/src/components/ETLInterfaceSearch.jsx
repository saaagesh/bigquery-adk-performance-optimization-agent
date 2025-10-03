import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { 
  Search, 
  Filter, 
  Database, 
  Clock, 
  User, 
  ChevronDown, 
  ChevronRight, 
  Zap, 
  Eye, 
  BarChart3, 
  Hash,
  RefreshCw,
  X
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

import AIRecommendationsModal from './AIRecommendationsModal';
import ExecutionPlanViewer from './ExecutionPlanViewer';
import PerformanceInsightsViewer from './PerformanceInsightsViewer';
import './ExpensiveQueries.css'; // Reuse the same styles

const API_BASE = Config.API_BASE_URL;

const ETLInterfaceSearch = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  
  // Interface codes and filtering
  const [availableInterfaceCodes, setAvailableInterfaceCodes] = useState([]);
  const [selectedInterfaceCodes, setSelectedInterfaceCodes] = useState([]);
  const [interfaceCodeFilter, setInterfaceCodeFilter] = useState('');
  const [days, setDays] = useState(1); // Default to 1 day
  
  // Query results and details
  const [filteredQueries, setFilteredQueries] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [queryDetails, setQueryDetails] = useState(null);
  const [recommendations, setRecommendations] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  
  // UI state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedQueries, setExpandedQueries] = useState(new Set());
  const [activeTab, setActiveTab] = useState('overview');
  
  // Loading states
  const [loadingInterfaceCodes, setLoadingInterfaceCodes] = useState(false);
  const [loadingQueries, setLoadingQueries] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  useEffect(() => {
    fetchInterfaceCodes();
  }, []);

  const fetchInterfaceCodes = async () => {
    try {
      setLoadingInterfaceCodes(true);
      const response = await axios.get(`${API_BASE}/etl-interface-codes`);
      setAvailableInterfaceCodes(response.data.interface_codes || []);
    } catch (error) {
      console.error('Error fetching interface codes:', error);
      setDebugInfo(`Error loading interface codes: ${error.response?.data?.message || error.message}`);
    } finally {
      setLoadingInterfaceCodes(false);
    }
  };

  const searchQueriesByInterface = async () => {
    if (selectedInterfaceCodes.length === 0) {
      alert('Please select at least one interface code');
      return;
    }

    try {
      setLoadingQueries(true);
      setDebugInfo('');
      const response = await axios.post(`${API_BASE}/etl-interface-queries`, {
        interface_codes: selectedInterfaceCodes,
        project: selectedProject,
        region: selectedRegion,
        days: days
      });
      
      if (response.data.debug) {
        setDebugInfo(response.data.debug);
      }
      
      setFilteredQueries(response.data.queries || []);
      setSelectedJobId(null);
      setQueryDetails(null);
      setRecommendations('');
    } catch (error) {
      console.error('Error searching queries:', error);
      setDebugInfo(`Error: ${error.response?.data?.message || error.message}`);
      setFilteredQueries([]);
    } finally {
      setLoadingQueries(false);
    }
  };

  const handleInterfaceCodeToggle = (interfaceCode) => {
    setSelectedInterfaceCodes(prev => {
      if (prev.includes(interfaceCode)) {
        return prev.filter(code => code !== interfaceCode);
      } else {
        return [...prev, interfaceCode];
      }
    });
  };

  const handleInterfaceCodeSelection = (updatedCodes) => {
    setSelectedInterfaceCodes(updatedCodes);
  };

  const clearAllInterfaceCodes = () => {
    setSelectedInterfaceCodes([]);
  };

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
    let hash = 0;
    for (let i = 0; i < query.length; i++) {
      const char = query.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8).toUpperCase();
  };

  const handleQuerySelect = async (jobId) => {
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
        ddl: queryDetails.ddl || "",
        execution_plan: queryDetails.execution_plan || [],
        execution_plan_summary: queryDetails.execution_plan_summary || "",
        performance_insights: queryDetails.performance_insights || null
      });
      setRecommendations(response.data.recommendations);
    } catch (error) {
      console.error('Error getting recommendations:', error);
      
      let errorMessage = "**Error Getting AI Recommendations**\n\n";
      
      if (error.response?.data?.recommendations) {
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

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  return (
    <div className="expensive-queries">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>ETL Interface Query Search</h2>
            <p>Search for queries by ETL Interface Code</p>
          </div>
        </div>
        <FilterControls 
          onRefresh={() => {
            fetchInterfaceCodes();
            if (selectedInterfaceCodes.length > 0) {
              searchQueriesByInterface();
            }
          }}
          loading={loadingInterfaceCodes || loadingQueries}
          showDaysFilter={true}
          days={days}
          onDaysChange={setDays}
          showInterfaceFilter={true}
          availableInterfaceCodes={availableInterfaceCodes}
          selectedInterfaceCodes={selectedInterfaceCodes}
          interfaceCodeFilter={interfaceCodeFilter}
          onInterfaceCodeFilterChange={setInterfaceCodeFilter}
          onInterfaceCodeToggle={handleInterfaceCodeToggle}
          onClearAllInterfaceCodes={clearAllInterfaceCodes}
          loadingInterfaceCodes={loadingInterfaceCodes}
        />
      </div>

      {/* Search Action Section */}
      <div style={{ 
        marginBottom: '20px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        padding: '10px 0'
      }}>
        <div style={{ fontSize: '14px', color: '#666' }}>
          {selectedInterfaceCodes.length > 0 ? (
            <>Selected {selectedInterfaceCodes.length} interface code{selectedInterfaceCodes.length !== 1 ? 's' : ''} for last {days} day{days !== 1 ? 's' : ''}</>
          ) : (
            <>Select interface codes from the filter above to search queries</>
          )}
        </div>
        <button
          onClick={searchQueriesByInterface}
          disabled={selectedInterfaceCodes.length === 0 || loadingQueries}
          style={{
            padding: '8px 20px',
            background: selectedInterfaceCodes.length === 0 ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: selectedInterfaceCodes.length === 0 ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px'
          }}
        >
          {loadingQueries ? <RefreshCw size={16} className="spinning" /> : <Search size={16} />}
          {loadingQueries ? 'Searching...' : 'Search Queries'}
        </button>
      </div>

      <div className="queries-container">
        <div className="queries-section">
          <div className="section-header">
            <h3>Query Results</h3>
            <span className="query-count">{filteredQueries.length} queries</span>
          </div>
          
          {debugInfo && (
            <div className="debug-info">
              <strong>Note:</strong> {debugInfo}
            </div>
          )}
          
          <div className="queries-list">
            {loadingQueries ? (
              <div className="loader"></div>
            ) : filteredQueries.length === 0 ? (
              <div className="empty-state">
                <Search size={48} />
                <h3>No queries found</h3>
                <p>Select interface codes above and click "Search" to find related queries from the last {days} day{days !== 1 ? 's' : ''}.</p>
              </div>
            ) : (
              filteredQueries.map((query, index) => {
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
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="query-rank">
                            <span className="rank-number">#{index + 1}</span>
                            <Database className="expense-icon" size={14} />
                          </div>
                          
                          <div className="query-identifier">
                            <div className="query-hash">
                              <Hash size={12} />
                              <span title="Query Hash: A unique identifier generated from the query structure to group similar queries">Hash: {queryHash}</span>
                            </div>
                            <div className="job-id">
                              <span className="job-id-label">Interface:</span>
                              <span className="job-id-value" style={{ background: '#28a745', color: 'white', padding: '1px 4px', borderRadius: '2px', fontSize: '10px' }} title={query.etl_intf_cd}>
                                {query.etl_intf_cd}
                              </span>
                            </div>
                          </div>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <div className="query-cost">
                            <span className="slot-ms">{(query.total_slot_ms / 1000).toFixed(0)}k</span>
                            <span className="slot-label">slot ms</span>
                          </div>
                          
                          <button 
                            className="expand-toggle"
                            onClick={(e) => toggleQueryExpansion(query.job_id, e)}
                            title={isExpanded ? 'Collapse details' : 'Expand details'}
                            style={{ position: 'static', padding: '2px', minWidth: 'auto' }}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="query-meta">
                      <div className="query-user" title={query.user_email}>
                        <User size={12} />
                        <span>{query.user_email.split('@')[0]}</span>
                      </div>
                      <div className="query-time">
                        <Clock size={12} />
                        <span>{new Date(query.creation_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      {query.duration_seconds && (
                        <div className="query-duration">
                          <span>{query.duration_seconds}s</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="query-preview">
                      <div className="preview-header">
                        <span className="preview-label">Preview:</span>
                        <span className="expand-hint" style={{ fontSize: '10px' }}>{isExpanded ? 'Collapse' : 'Expand'}</span>
                      </div>
                      <code title={query.query_preview || query.query?.substring(0, Config.MAX_QUERY_PREVIEW_LENGTH) || 'No preview available'}>
                        {query.query_preview || query.query?.substring(0, 150) || 'No preview available'}
                      </code>
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
                            <span className="metric-label">Interface:</span>
                            <span className="metric-value" style={{ background: '#28a745', color: 'white', padding: '2px 6px', borderRadius: '3px', fontSize: '11px' }}>
                              {query.etl_intf_cd}
                            </span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Data:</span>
                            <span className="metric-value">{query.gb_processed ? query.gb_processed.toFixed(2) + ' GB' : 'N/A'}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">State:</span>
                            <span className="metric-value">{query.state || 'N/A'}</span>
                          </div>
                          {query.error_reason && (
                            <div className="metric">
                              <span className="metric-label">Error:</span>
                              <span className="metric-value" style={{ color: '#dc3545' }}>{query.error_reason}</span>
                            </div>
                          )}
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
              <Database size={48} />
              <h3>Select a query to analyze</h3>
              <p>Choose a query from the results to see detailed analysis and optimization recommendations</p>
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
                      <span>Query Hash: {getQueryHash(queryDetails?.query || filteredQueries.find(q => q.job_id === selectedJobId)?.query)}</span>
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
                          <span className="summary-label">ETL Interface</span>
                          <span className="summary-value" style={{ background: '#28a745', color: 'white', padding: '4px 8px', borderRadius: '4px' }}>
                            {filteredQueries.find(q => q.job_id === selectedJobId)?.etl_intf_cd || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="quick-insights">
                      <h4>Quick Insights</h4>
                      <div className="insight-item">
                        <span className="insight-label">ETL Interface Code:</span>
                        <span className="insight-value">{filteredQueries.find(q => q.job_id === selectedJobId)?.etl_intf_cd || 'N/A'}</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">Executed by:</span>
                        <span className="insight-value">{queryDetails.user_email || 'N/A'}</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">Project:</span>
                        <span className="insight-value">{queryDetails.project_id || selectedProject}</span>
                      </div>
                      <div className="insight-item">
                        <span className="insight-label">State:</span>
                        <span className="insight-value">{filteredQueries.find(q => q.job_id === selectedJobId)?.state || 'N/A'}</span>
                      </div>
                    </div>
                    
                    <div className="query-content">
                      <h4>Query Content</h4>
                      <pre className="sql-code">
                        {(() => {
                          const selectedQuery = filteredQueries.find(q => q.job_id === selectedJobId);
                          
                          if (queryDetails?.query) {
                            return queryDetails.query;
                          }
                          
                          if (selectedQuery?.query) {
                            return selectedQuery.query;
                          }
                          
                          if (selectedQuery?.query_preview) {
                            return selectedQuery.query_preview;
                          }
                          
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
                    <ExecutionPlanViewer plan={queryDetails.execution_plan} summary={queryDetails.execution_plan_summary} />
                  </div>
                )}
                
                {activeTab === 'optimization' && (
                  <div className="optimization-tab">
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
                    </div>
                    
                    {queryDetails.ddl && (
                      <div className="schema-section">
                        <h5>Referenced Tables Schema</h5>
                        <pre className="ddl-code">{queryDetails.ddl}</pre>
                      </div>
                    )}
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

export default ETLInterfaceSearch;