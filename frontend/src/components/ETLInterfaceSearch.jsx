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
import QueryModal from './QueryModal';
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
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [selectedQueryForModal, setSelectedQueryForModal] = useState(null);
  
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
      
      // Debug: Log query structure to see available fields
      if (response.data.queries && response.data.queries.length > 0) {
        console.log('ETL Query sample structure:', response.data.queries[0]);
        console.log('Available fields:', Object.keys(response.data.queries[0]));
      }
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
    console.log('Toggling expansion for jobId:', jobId, 'Current expanded:', expandedQueries.has(jobId));
    const newExpanded = new Set(expandedQueries);
    if (newExpanded.has(jobId)) {
      newExpanded.delete(jobId);
    } else {
      newExpanded.add(jobId);
    }
    console.log('New expanded state:', newExpanded);
    setExpandedQueries(newExpanded);
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

  const openQueryModal = (query) => {
    setSelectedQueryForModal(query);
    setQueryModalOpen(true);
  };

  const closeQueryModal = () => {
    setQueryModalOpen(false);
    setSelectedQueryForModal(null);
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
      <div className="search-action-section">
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
          className={`search-queries-btn ${selectedInterfaceCodes.length === 0 ? 'disabled' : ''}`}
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
                        <Database className="expense-icon" size={14} />
                      </div>
                      
                      <div className="query-identifier">
                        <div className="query-hash">
                          <Hash size={14} />
                          <span title="ETL Interface Code">Interface: {query.etl_intf_cd}</span>
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
                        <button
                          className="show-full-query-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleQueryExpansion(query.job_id, e);
                          }}
                        >
                          {isExpanded ? 'Hide Full Query' : 'Show Full Query'}
                        </button>
                      </div>
                      <code>{query.query_preview || query.query?.substring(0, Config.MAX_QUERY_PREVIEW_LENGTH) || 'No preview available'}</code>
                    </div>
                    
                    {isExpanded && (
                      <div className="query-expanded-details">
                        <div className="expanded-sql-section">
                          <div className="sql-header">
                            <h5>Full SQL Query</h5>
                            <div className="query-id-display">
                              <span className="query-id-label">Interface:</span>
                              <span className="query-id-value">{query.etl_intf_cd}</span>
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
              <Search size={48} />
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
                      <span>Interface: {filteredQueries.find(q => q.job_id === selectedJobId)?.etl_intf_cd || 'N/A'}</span>
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
                    {(() => {
                      // Get the selected query data once to avoid multiple lookups
                      const selectedQuery = filteredQueries.find(q => q.job_id === selectedJobId);
                      
                      return (
                        <>
                          <div className="performance-summary">
                            <h4>Query Performance Summary</h4>
                            <div className="summary-grid">
                              <div className="summary-item">
                                <span className="summary-label">Slot Milliseconds</span>
                                <span className="summary-value">{selectedQuery?.total_slot_ms?.toLocaleString() || 'N/A'}</span>
                              </div>
                              <div className="summary-item">
                                <span className="summary-label">Duration</span>
                                <span className="summary-value">{selectedQuery?.duration_seconds ? selectedQuery.duration_seconds + 's' : 'N/A'}</span>
                              </div>
                              <div className="summary-item">
                                <span className="summary-label">Data Processed</span>
                                <span className="summary-value">{selectedQuery?.total_bytes_processed ? (selectedQuery.total_bytes_processed / (1024*1024*1024)).toFixed(2) + ' GB' : 'N/A'}</span>
                              </div>
                              <div className="summary-item">
                                <span className="summary-label">ETL Interface</span>
                                <span className="summary-value etl-interface-badge">
                                  {selectedQuery?.etl_intf_cd || 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          <div className="quick-insights">
                            <h4>Quick Insights</h4>
                            <div className="insight-item">
                              <span className="insight-label">ETL Interface Code:</span>
                              <span className="insight-value">{selectedQuery?.etl_intf_cd || 'N/A'}</span>
                            </div>
                            <div className="insight-item">
                              <span className="insight-label">Executed by:</span>
                              <span className="insight-value">{selectedQuery?.user_email || queryDetails?.user_email || 'N/A'}</span>
                            </div>
                            <div className="insight-item">
                              <span className="insight-label">Project:</span>
                              <span className="insight-value">{selectedQuery?.project_id || queryDetails?.project_id || selectedProject}</span>
                            </div>
                            <div className="insight-item">
                              <span className="insight-label">State:</span>
                              <span className="insight-value">{selectedQuery?.state || 'N/A'}</span>
                            </div>
                            <div className="insight-item">
                              <span className="insight-label">Creation Time:</span>
                              <span className="insight-value">{selectedQuery?.creation_time ? new Date(selectedQuery.creation_time).toLocaleString() : 'N/A'}</span>
                            </div>
                            <div className="insight-item">
                              <span className="insight-label">Job Type:</span>
                              <span className="insight-value">{selectedQuery?.job_type || 'QUERY'}</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                    
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
      
      <QueryModal
        query={selectedQueryForModal}
        isOpen={queryModalOpen}
        onClose={closeQueryModal}
      />
    </div>
  );
};

export default ETLInterfaceSearch;