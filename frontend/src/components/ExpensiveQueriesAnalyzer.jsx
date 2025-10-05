import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Clock, 
  User, 
  TrendingUp, 
  Eye, 
  BarChart3,
  Target,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Database,
  ArrowRight
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import ExecutionPlanViewer from './ExecutionPlanViewer';
import PerformanceInsightsViewer from './PerformanceInsightsViewer';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';
import axios from 'axios';
import './ExpensiveQueriesAnalyzer.css';

const API_BASE = Config.API_BASE_URL;

const ExpensiveQueriesAnalyzer = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [expensiveQueries, setExpensiveQueries] = useState([]);
  const [selectedQuery, setSelectedQuery] = useState(null);
  const [analysisData, setAnalysisData] = useState(null);
  const [expandedQuery, setExpandedQuery] = useState(null);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState('overview');
  
  const [loading, setLoading] = useState({
    queries: false,
    analysis: false,
    insights: false,
    recommendations: false
  });

  // Ref for scrolling to expanded query
  const expandedQueryRef = useRef(null);

  useEffect(() => {
    fetchExpensiveQueries();
  }, [selectedProject, selectedRegion]);

  const fetchExpensiveQueries = async () => {
    try {
      setLoading(prev => ({ ...prev, queries: true }));
      
      const response = await axios.get(
        `${API_BASE}/expensive-queries?project=${selectedProject}&region=${selectedRegion}`
      );
      
      const queries = response.data.queries || response.data || [];
      
      // Enhance queries with optimization potential estimation
      const enhancedQueries = queries.map(query => ({
        ...query,
        optimizationPotential: calculateOptimizationPotential(query),
        complexity: assessComplexity(query.query),
        riskLevel: assessRiskLevel(query)
      }));
      
      setExpensiveQueries(enhancedQueries);
    } catch (error) {
      console.error('Error fetching queries:', error);
      setExpensiveQueries([]);
    } finally {
      setLoading(prev => ({ ...prev, queries: false }));
    }
  };

  const handleQueryExpansion = (queryJobId, event) => {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('Expanding query:', queryJobId, 'Current expanded:', expandedQuery);
    
    const wasExpanded = expandedQuery === queryJobId;
    const newExpandedState = wasExpanded ? null : queryJobId;
    
    console.log('Setting expanded to:', newExpandedState);
    setExpandedQuery(newExpandedState);
    
    // If expanding (not collapsing), scroll to the query after a short delay
    if (!wasExpanded) {
      setTimeout(() => {
        const queryElement = document.getElementById(`query-card-${queryJobId}`);
        if (queryElement) {
          queryElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  };

  const calculateOptimizationPotential = (query) => {
    // Simple heuristic for optimization potential
    let score = 0;
    
    if (query.total_slot_ms > 5000000) score += 30; // Very expensive
    if (query.duration_seconds > 60) score += 20; // Long running
    if (query.gb_processed > 100) score += 25; // Large data scan
    
    // Check query patterns for optimization opportunities
    const queryText = query.query.toLowerCase();
    if (queryText.includes('select *')) score += 15;
    if (!queryText.includes('where')) score += 20;
    if (queryText.includes('cross join')) score += 25;
    if ((queryText.match(/join/g) || []).length > 3) score += 15;
    
    return Math.min(score, 90); // Cap at 90%
  };

  const assessComplexity = (queryText) => {
    const joins = (queryText.match(/join/gi) || []).length;
    const subqueries = (queryText.match(/\(/g) || []).length;
    const windows = (queryText.match(/over\s*\(/gi) || []).length;
    
    const score = joins * 2 + subqueries + windows * 3;
    
    if (score <= 3) return 'Simple';
    if (score <= 8) return 'Medium';
    return 'Complex';
  };

  const assessRiskLevel = (query) => {
    if (query.total_slot_ms > 10000000 || query.gb_processed > 1000) return 'High';
    if (query.total_slot_ms > 1000000 || query.gb_processed > 100) return 'Medium';
    return 'Low';
  };

  const analyzeQuery = async (query) => {
    setSelectedQuery(query);
    setActiveAnalysisTab('overview');
    
    try {
      setLoading(prev => ({ ...prev, analysis: true }));
      
      // First get query details to obtain DDL schema information
      console.log('Fetching query details for job:', query.job_id);
      const detailsResponse = await axios.post(`${API_BASE}/query-details`, { 
        job_id: query.job_id,
        include_execution_plan: true,
        include_performance_insights: true
      });
      
      console.log('Query details received, DDL length:', detailsResponse.data.ddl?.length || 0);
      
      // Then get optimization recommendations with the DDL schema
      const optimizationResponse = await axios.post(`${API_BASE}/optimize`, {
        query: query.query,
        ddl: detailsResponse.data.ddl || '',
        execution_plan: detailsResponse.data.execution_plan || [],
        execution_plan_summary: detailsResponse.data.execution_plan_summary || '',
        performance_insights: detailsResponse.data.performance_insights || null,
        analysis_type: 'comprehensive'
      });

      const analysisResult = {
        queryDetails: {
          ...detailsResponse.data,
          execution_plan: detailsResponse.data.execution_plan || null,
          execution_plan_summary: detailsResponse.data.execution_plan_summary || "",
          performance_insights: detailsResponse.data.performance_insights || null,
        },
        optimization: {
          recommendations: optimizationResponse.data.recommendations
        },
        query: query
      };

      setAnalysisData(analysisResult);
    } catch (error) {
      console.error('Error analyzing query:', error);
      
      // Fallback with basic analysis
      try {
        const basicResponse = await axios.post(`${API_BASE}/optimize`, {
          query: query.query,
          ddl: '',
          execution_plan: [],
          execution_plan_summary: '',
          performance_insights: null
        });
        
        setAnalysisData({
          queryDetails: { query: query.query, ddl: '' },
          optimization: {
            recommendations: basicResponse.data.recommendations
          },
          query: query,
          message: 'Basic analysis completed. Some advanced features may not be available.'
        });
      } catch (fallbackError) {
        console.error('Fallback analysis failed:', fallbackError);
        setAnalysisData({
          error: 'Unable to analyze query. Please check your configuration.',
          query: query
        });
      }
    } finally {
      setLoading(prev => ({ ...prev, analysis: false }));
    }
  };

  const getOptimizationPotentialColor = (potential) => {
    if (potential >= 70) return '#dc3545'; // High potential - red
    if (potential >= 40) return '#ffc107'; // Medium potential - yellow
    return '#28a745'; // Low potential - green
  };

  const getRiskLevelColor = (risk) => {
    switch (risk) {
      case 'High': return '#dc3545';
      case 'Medium': return '#ffc107';
      default: return '#28a745';
    }
  };

  const analysisTabsConfig = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'execution-plan', label: 'Execution Plan', icon: BarChart3 },
    { id: 'recommendations', label: 'Optimization', icon: Target }
  ];

  return (
    <div className="expensive-queries-analyzer">
      <div className="analyzer-header">
        <div className="header-content">
          <div>
            <h2>🔥 Top Expensive Queries Analysis</h2>
            <p>Deep dive into your most resource-intensive queries with AI-powered optimization insights</p>
          </div>
        </div>
        <FilterControls 
          onRefresh={fetchExpensiveQueries}
          loading={loading.queries}
        />
      </div>

      <div className="analyzer-layout">
        {/* Queries List */}
        <div className="queries-panel">
          <div className="panel-header">
            <h3>🔍 Top Most Expensive Queries by Slots</h3>
            {/* Updated to show full query ID */}
            <div className="queries-count">
              {expensiveQueries.length} queries found
            </div>
          </div>
          
          <div className="queries-list">
            {loading.queries ? (
              <div className="loading-state">
                <div className="loader"></div>
                <p>Loading expensive queries...</p>
              </div>
            ) : expensiveQueries.length === 0 ? (
              <div className="empty-queries">
                <Zap size={48} />
                <h3>No expensive queries found</h3>
                <p>Try adjusting the time range or check a different project</p>
              </div>
            ) : (
              expensiveQueries.map((query, index) => (
                <div 
                  key={query.job_id} 
                  id={`query-card-${query.job_id}`}
                  className={`query-card ${selectedQuery?.job_id === query.job_id ? 'selected' : ''} ${expandedQuery === query.job_id ? 'expanded' : ''}`}
                >
                  <div className="query-card-header" onClick={(e) => {
                    // Only analyze if not clicking on expand button area
                    if (!e.target.closest('.expand-button')) {
                      analyzeQuery(query);
                    }
                  }}>
                    <div className="query-rank">
                      <span className="rank-number">#{index + 1}</span>
                      <div className="expense-indicators">
                        <span 
                          className="optimization-potential"
                          style={{ color: getOptimizationPotentialColor(query.optimizationPotential) }}
                        >
                          {query.optimizationPotential}% opt
                        </span>
                        <span 
                          className="risk-level"
                          style={{ color: getRiskLevelColor(query.riskLevel) }}
                        >
                          {query.riskLevel}
                        </span>
                      </div>
                    </div>
                    
                    <div className="query-metrics">
                      <div className="metric">
                        <Zap size={14} />
                        <span>{(query.total_slot_ms / 1000).toLocaleString()}K slot ms</span>
                      </div>
                      <div className="metric">
                        <Clock size={14} />
                        <span>{query.duration_seconds}s</span>
                      </div>
                      <div className="metric">
                        <Database size={14} />
                        <span>{query.gb_processed?.toFixed(1) || 0} GB</span>
                      </div>
                    </div>
                  </div>

                  <div className="query-meta">
                    <div className="query-user">
                      <User size={12} />
                      <span>{query.user_email}</span>
                    </div>
                    <div className="query-complexity">
                      <span className={`complexity-badge ${query.complexity.toLowerCase()}`}>
                        {query.complexity}
                      </span>
                    </div>
                    <div className="query-meta-right">
                      <div className="query-job-id">
                        <span className="job-id-label">Query ID:</span>
                        <span className="job-id-value">{query.job_id}</span>
                      </div>
                      <div className="query-time">
                        {new Date(query.creation_time).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div className="query-preview">
                    <div className="query-preview-header">
                      <span className="preview-label">SQL Query Preview:</span>
                      <button
                        className="expand-button"
                        onClick={(e) => handleQueryExpansion(query.job_id, e)}
                      >
                        <span>
                          {expandedQuery === query.job_id ? 'Hide Full Query' : 'Show Full Query'}
                        </span>
                        {expandedQuery === query.job_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                    
                    <div className="query-preview-content">
                      <code className="query-preview-text">
                        {query.query?.substring(0, 150) || 'Query preview not available'}...
                      </code>
                    </div>
                    
                    {expandedQuery === query.job_id && (
                      <div className="query-full-text">
                        <div className="full-query-header">
                          <h5>Complete SQL Query</h5>
                          <div className="query-id-display">
                            <span>Query ID: {query.job_id}</span>
                          </div>
                        </div>
                        <pre className="query-code">{query.query || 'Full query not available'}</pre>
                      </div>
                    )}
                  </div>

                  <div className="query-actions">
                    <button
                      className="analyze-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        analyzeQuery(query);
                      }}
                      disabled={loading.analysis}
                    >
                      <Target size={14} />
                      Analyze & Optimize
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Analysis Panel */}
        <div className="analysis-panel">
          {selectedQuery ? (
            <div className="analysis-content">
              <div className="analysis-header">
                <h3>Query Analysis</h3>
                <div className="query-job-id">
                  Job ID: {selectedQuery.job_id}
                </div>
              </div>

              {loading.analysis ? (
                <div className="loading-analysis">
                  <div className="loader"></div>
                  <p>Analyzing query performance and generating optimization recommendations...</p>
                </div>
              ) : analysisData ? (
                <div className="analysis-results">
                  {analysisData.message && (
                    <div className="analysis-notice">
                      <Lightbulb size={16} />
                      {analysisData.message}
                    </div>
                  )}

                  {analysisData.error ? (
                    <div className="analysis-error">
                      <span>⚠️ {analysisData.error}</span>
                    </div>
                  ) : (
                    <>
                      <div className="analysis-tabs">
                        {analysisTabsConfig.map(tab => {
                          const IconComponent = tab.icon;
                          return (
                            <button
                              key={tab.id}
                              className={`analysis-tab ${activeAnalysisTab === tab.id ? 'active' : ''}`}
                              onClick={() => setActiveAnalysisTab(tab.id)}
                            >
                              <IconComponent size={16} />
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>

                      <div className="tab-content">
                        {activeAnalysisTab === 'overview' && (
                          <div className="overview-content">
                            <div className="query-summary">
                              <h4>Query Performance Summary</h4>
                              <div className="summary-grid">
                                <div className="summary-item">
                                  <span className="label">Slot Milliseconds</span>
                                  <span className="value">{selectedQuery.total_slot_ms.toLocaleString()}</span>
                                </div>
                                <div className="summary-item">
                                  <span className="label">Duration</span>
                                  <span className="value">{selectedQuery.duration_seconds}s</span>
                                </div>
                                <div className="summary-item">
                                  <span className="label">Data Processed</span>
                                  <span className="value">{selectedQuery.gb_processed?.toFixed(2) || 0} GB</span>
                                </div>
                                <div className="summary-item">
                                  <span className="label">Optimization Potential</span>
                                  <span 
                                    className="value potential"
                                    style={{ color: getOptimizationPotentialColor(selectedQuery.optimizationPotential) }}
                                  >
                                    {selectedQuery.optimizationPotential}%
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="quick-insights">
                              <h4>Quick Insights</h4>
                              <ul>
                                <li>Query complexity: <strong>{selectedQuery.complexity}</strong></li>
                                <li>Resource risk level: <strong>{selectedQuery.riskLevel}</strong></li>
                                <li>Executed by: <strong>{selectedQuery.user_email}</strong></li>
                                <li>Project: <strong>{selectedQuery.project_id}</strong></li>
                              </ul>
                            </div>
                          </div>
                        )}

                        {activeAnalysisTab === 'execution-plan' && (
                          <div className="execution-plan-content">
                            <ExecutionPlanViewer 
                              plan={analysisData.queryDetails.execution_plan}
                              summary={analysisData.queryDetails.execution_plan_summary}
                            />
                          </div>
                        )}

                        {activeAnalysisTab === 'recommendations' && (
                          <div className="recommendations-content">
                            <h4>AI-Powered Optimization Recommendations</h4>
                            {analysisData.optimization?.recommendations ? (
                              <div className="recommendations-markdown">
                                <ReactMarkdown>{analysisData.optimization.recommendations}</ReactMarkdown>
                              </div>
                            ) : (
                              <div className="no-recommendations">
                                <Target size={48} />
                                <p>Generating optimization recommendations...</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="no-analysis">
                  <Target size={48} />
                  <h3>No Analysis Yet</h3>
                  <p>Click "Analyze & Optimize" on any query to get detailed insights</p>
                </div>
              )}
            </div>
          ) : (
            <div className="no-selection">
              <Eye size={64} />
              <h3>Select a Query to Analyze</h3>
              <p>Choose any query from the list to get comprehensive optimization insights</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpensiveQueriesAnalyzer;