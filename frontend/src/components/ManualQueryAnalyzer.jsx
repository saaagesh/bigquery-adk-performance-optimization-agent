import React, { useState } from 'react';
import { 
  Search, 
  FileText, 
  Clock, 
  Database, 
  TrendingUp,
  AlertCircle,
  Loader,
  Copy,
  Eye,
  BarChart3,
  Zap,
  Hash
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppContext } from '../context/AppContext';
import Config from '../config';
import axios from 'axios';
import ExecutionPlanViewer from './ExecutionPlanViewer';
import AIRecommendationsModal from './AIRecommendationsModal';
import './ManualQueryAnalyzer.css';
import './AIRecommendationsModal.css';

const API_BASE = Config.API_BASE_URL;

const ManualQueryAnalyzer = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [queryText, setQueryText] = useState('');
  const [jobId, setJobId] = useState('');
  const [queryDetails, setQueryDetails] = useState(null);
  const [recommendations, setRecommendations] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState({
    details: false,
    recommendations: false
  });
  const [activeTab, setActiveTab] = useState('input');
  const [analysisMode, setAnalysisMode] = useState('query'); // 'query' or 'jobid'

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

  const findJobIdInQuery = async () => {
    if (!queryText.trim()) return null;

    try {
      console.log('=== SEARCHING FOR JOB ID ===');
      console.log('Query text length:', queryText.length);
      // Search for recent queries matching this query text
      const response = await axios.post(`${API_BASE}/find-job-by-query`, {
        query: queryText,
        project: selectedProject,
        region: selectedRegion
      });
      
      console.log('Job search response:', response.data);
      return response.data.jobId || null;
    } catch (error) {
      console.error('Error finding job ID:', error);
      return null;
    }
  };

  const analyzeByJobId = async (targetJobId) => {
    setLoading(prev => ({ ...prev, details: true }));
    
    try {
      console.log('=== MANUAL ANALYSIS: FETCHING QUERY DETAILS ===');
      console.log('Target Job ID:', targetJobId);
      
      const response = await axios.post(`${API_BASE}/query-details`, { job_id: targetJobId });
      
      console.log('=== MANUAL ANALYSIS: BACKEND RESPONSE ===', response.data);
      console.log('Execution plan length:', response.data.execution_plan?.length || 0);
      console.log('Has execution plan summary:', !!response.data.execution_plan_summary);
      console.log('Performance insights available:', !!response.data.performance_insights);
      console.log('Debug info:', response.data.debug_info);
      
      // Validate execution plan data
      if (response.data.execution_plan && response.data.execution_plan.length > 0) {
        console.log('✅ EXECUTION PLAN AVAILABLE for optimization');
        console.log('First execution stage:', response.data.execution_plan[0]);
      } else {
        console.log('⚠️ WARNING: No execution plan data available');
      }
      
      setQueryDetails(response.data);
      setActiveTab('overview');
    } catch (error) {
      console.error('=== MANUAL ANALYSIS: ERROR FETCHING QUERY DETAILS ===', error);
      alert('Error fetching query details. The job ID may not exist or may be too old (>180 days).');
      setQueryDetails(null);
    } finally {
      setLoading(prev => ({ ...prev, details: false }));
    }
  };

  const analyzeQuery = async () => {
    if (analysisMode === 'jobid') {
      if (!jobId.trim()) {
        alert('Please enter a valid BigQuery Job ID');
        return;
      }
      await analyzeByJobId(jobId.trim());
    } else {
      if (!queryText.trim()) {
        alert('Please enter a SQL query');
        return;
      }
      
      // First try to find the job ID for this query
      const foundJobId = await findJobIdInQuery();
      
      if (foundJobId) {
        console.log('Found matching job ID:', foundJobId);
        setJobId(foundJobId);
        await analyzeByJobId(foundJobId);
      } else {
        // Use comprehensive manual analysis with DDL extraction
        setLoading(prev => ({ ...prev, details: true }));
        try {
          console.log('=== MANUAL COMPREHENSIVE ANALYSIS START ===');
          const response = await axios.post(`${API_BASE}/analyze-manual-query`, {
            query: queryText
          });
          
          console.log('=== MANUAL COMPREHENSIVE ANALYSIS RESPONSE ===', response.data);
          setQueryDetails(response.data);
          setActiveTab('overview');
        } catch (error) {
          console.error('Error in comprehensive manual analysis:', error);
          alert('Unable to analyze query. Please check your configuration and try again.');
        } finally {
          setLoading(prev => ({ ...prev, details: false }));
        }
      }
    }
  };

  const getOptimizationRecommendations = async () => {
    if (!queryDetails) return;
    
    console.log('=== STARTING OPTIMIZATION REQUEST ===');
    console.log('Query details object:', queryDetails);
    console.log('Execution plan to send:', queryDetails.execution_plan);
    console.log('Execution plan summary to send:', queryDetails.execution_plan_summary);
    console.log('Performance insights to send:', queryDetails.performance_insights);
    
    setIsModalOpen(true);
    try {
      setLoading(prev => ({ ...prev, recommendations: true }));
      
      const optimizationPayload = {
        query: queryDetails.query,
        ddl: queryDetails.ddl || "",
        execution_plan: queryDetails.execution_plan || [],
        execution_plan_summary: queryDetails.execution_plan_summary || "",
        performance_insights: queryDetails.performance_insights || null
      };
      
      console.log('=== SENDING TO OPTIMIZATION ENDPOINT ===');
      console.log('Payload:', optimizationPayload);
      
      const response = await axios.post(`${API_BASE}/optimize`, optimizationPayload);
      
      console.log('=== OPTIMIZATION RESPONSE RECEIVED ===');
      console.log('Response length:', response.data.recommendations?.length || 0);
      
      setRecommendations(response.data.recommendations);
    } catch (error) {
      console.error('=== ERROR IN OPTIMIZATION ===', error);
      
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
      setLoading(prev => ({ ...prev, recommendations: false }));
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const tabs = [
    { id: 'input', label: 'Query Input', icon: FileText },
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'execution', label: 'Execution Plan', icon: BarChart3 },
    { id: 'optimization', label: 'Optimization', icon: Zap }
  ];

  return (
    <div className="manual-query-analyzer">
      {loading.details && (
        <div className="analysis-overlay">
          <div className="analysis-overlay-content">
            <Loader className="spinning large" size={48} />
            <h3>
              {analysisMode === 'jobid' 
                ? 'Analyzing BigQuery Job...' 
                : 'Searching for executed queries and analyzing...'}
            </h3>
            <p>
              {analysisMode === 'jobid'
                ? 'Retrieving execution plans, performance insights, and table schemas'
                : 'Scanning BigQuery job history and extracting comprehensive analysis data'}
            </p>
          </div>
        </div>
      )}
      <div className="analyzer-header">
        <div className="header-content">
          <div>
            <h2>Manual Query Analyzer</h2>
            <p>Paste your BigQuery SQL or Job ID for comprehensive optimization analysis</p>
          </div>
          <div className="analyzer-actions">
            <button 
              className="btn-secondary"
              onClick={() => {
                setQueryText('');
                setJobId('');
                setQueryDetails(null);
                setRecommendations('');
              }}
              disabled={(!queryText.trim() && !jobId.trim())}
            >
              Clear
            </button>
            <button 
              className="btn-primary"
              onClick={analyzeQuery}
              disabled={(analysisMode === 'query' && !queryText.trim()) || (analysisMode === 'jobid' && !jobId.trim()) || loading.details}
            >
              {loading.details ? (
                <>
                  <Loader className="spinning" size={16} />
                  {analysisMode === 'jobid' ? 'Analyzing Job...' : 'Analyzing Query...'}
                </>
              ) : (
                <>
                  <Search size={16} />
                  Analyze {analysisMode === 'jobid' ? 'Job' : 'Query'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="analyzer-content">
        <div className="analyzer-tabs">
          {tabs.map(tab => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <IconComponent size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="tab-content">
          {activeTab === 'input' && (
            <div className="input-section">
              <div className="analysis-mode-selector">
                <h3>Analysis Mode</h3>
                <div className="mode-options">
                  <label className={`mode-option ${analysisMode === 'query' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      value="query"
                      checked={analysisMode === 'query'}
                      onChange={(e) => setAnalysisMode(e.target.value)}
                    />
                    <span>Analyze by SQL Query</span>
                  </label>
                  <label className={`mode-option ${analysisMode === 'jobid' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      value="jobid"
                      checked={analysisMode === 'jobid'}
                      onChange={(e) => setAnalysisMode(e.target.value)}
                    />
                    <span>Analyze by Job ID</span>
                  </label>
                </div>
              </div>

              {analysisMode === 'jobid' ? (
                <div className="jobid-input-container">
                  <div className="input-header">
                    <h3>BigQuery Job ID Input</h3>
                  </div>
                  
                  <input
                    type="text"
                    className="jobid-input"
                    placeholder="Enter BigQuery Job ID (e.g., job_1234567890)"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                  />
                  
                  <div className="input-note">
                    <AlertCircle size={16} />
                    <p><strong>Note:</strong> The job must have been executed within the last 180 days and completed successfully for detailed analysis.</p>
                  </div>
                </div>
              ) : (
                <div className="query-input-container">
                  <div className="input-header">
                    <h3>SQL Query Input</h3>
                  </div>
                
                  <textarea
                    className="query-textarea"
                    placeholder="Paste your BigQuery SQL here...

Example:
SELECT 
  customer_id,
  COUNT(*) as order_count,
  SUM(amount) as total_amount
FROM `project.dataset.orders`
WHERE order_date >= '2024-01-01'
GROUP BY customer_id
ORDER BY total_amount DESC
LIMIT 100"
                    value={queryText}
                    onChange={(e) => setQueryText(e.target.value)}
                    rows={15}
                  />
                  
                  <div className="input-note">
                    <AlertCircle size={16} />
                    <p><strong>Best Results:</strong> For comprehensive analysis with execution plans and performance insights, ensure this query has been executed recently in BigQuery.</p>
                  </div>
                
                  <div className="input-footer">
                    <div className="query-stats">
                      <span>Characters: {queryText.length}</span>
                      <span>Lines: {queryText.split('\n').length}</span>
                    </div>
                    <button
                      className="btn-link"
                      onClick={() => copyToClipboard(queryText)}
                      disabled={!queryText.trim()}
                    >
                      <Copy size={14} />
                      Copy
                    </button>
                  </div>
                </div>
              )}

              <div className="quick-tips">
                <h4>💡 Analysis Tips</h4>
                <ul>
                  {analysisMode === 'jobid' ? (
                    <>
                      <li>Job ID can be found in BigQuery Console under "Job History"</li>
                      <li>Jobs older than 180 days are not available for analysis</li>
                      <li>Only successfully completed QUERY jobs provide full insights</li>
                      <li>Format: job_1234567890abcdef or just the numeric portion</li>
                    </>
                  ) : (
                    <>
                      <li>Use fully qualified table names (project.dataset.table)</li>
                      <li>For best results, execute the query in BigQuery first</li>
                      <li>Recent executions provide execution plans and performance data</li>
                      <li>Unexecuted queries receive basic structural optimization only</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'overview' && (
            <div className="overview-section">
              {!queryDetails ? (
                <div className="empty-state">
                  <Eye size={48} />
                  <h3>No analysis performed</h3>
                  <p>Use the Query Input tab to analyze a SQL query or Job ID</p>
                </div>
              ) : loading.details ? (
                <div className="loader"></div>
              ) : (
                <div className="overview-content">
                  <div className="query-info">
                    <div className="query-identifiers">
                      <div className="query-id-badge">
                        <Hash size={14} />
                        <span>Query ID: {getQueryHash(queryDetails?.query)}</span>
                      </div>
                      {jobId && (
                        <div className="job-id-display">
                          <span className="job-id-label">Job ID:</span>
                          <code className="job-id-code">{jobId}</code>
                        </div>
                      )}
                    </div>
                    
                    {queryDetails.analysis_mode !== 'basic' && queryDetails.analysis_mode !== 'comprehensive_manual' && (
                      <div className="performance-summary">
                        <h4>Query Performance Summary</h4>
                        <div className="summary-grid">
                          <div className="summary-item">
                            <span className="summary-label">Analysis Type</span>
                            <span className="summary-value">{queryDetails.analysis_mode === 'basic' ? 'Basic Structure' : 'Full Execution Data'}</span>
                          </div>
                          {queryDetails.total_slot_ms && (
                            <div className="summary-item">
                              <span className="summary-label">Slot Milliseconds</span>
                              <span className="summary-value">{queryDetails.total_slot_ms.toLocaleString()}</span>
                            </div>
                          )}
                          {queryDetails.duration_seconds && (
                            <div className="summary-item">
                              <span className="summary-label">Duration</span>
                              <span className="summary-value">{queryDetails.duration_seconds}s</span>
                            </div>
                          )}
                          {queryDetails.total_bytes_processed && (
                            <div className="summary-item">
                              <span className="summary-label">Data Processed</span>
                              <span className="summary-value">{(queryDetails.total_bytes_processed / (1024*1024*1024)).toFixed(2)} GB</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    
                    {queryDetails.analysis_mode === 'comprehensive_manual' && (
                      <div className="comprehensive-analysis-info">
                        <h4>Comprehensive Analysis Summary</h4>
                        <div className="summary-grid">
                          <div className="summary-item">
                            <span className="summary-label">Analysis Type</span>
                            <span className="summary-value">Comprehensive Schema Analysis</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Tables Analyzed</span>
                            <span className="summary-value">{queryDetails.tables_analyzed || 0}</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">Schema Extraction</span>
                            <span className="summary-value">{queryDetails.schema_extraction_success || 0} successful</span>
                          </div>
                          <div className="summary-item">
                            <span className="summary-label">DDL Available</span>
                            <span className="summary-value">{queryDetails.ddl ? 'Yes' : 'No'}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="query-content">
                    <h4>Query Content</h4>
                    <pre className="sql-code">{queryDetails.query || 'No query content available'}</pre>
                    
                    {queryDetails.analysis_mode === 'basic' && (
                      <div className="analysis-note">
                        <AlertCircle size={16} />
                        <p><strong>Note:</strong> This query was not found in recent BigQuery execution history. Analysis is based on query structure only. For comprehensive analysis with execution plans and performance insights, execute the query in BigQuery first.</p>
                      </div>
                    )}
                    
                    {queryDetails.analysis_mode === 'comprehensive_manual' && (
                      <div className="comprehensive-analysis-note">
                        <Database size={16} />
                        <p><strong>Comprehensive Analysis:</strong> Table schemas and DDL have been extracted for detailed optimization analysis. While execution plans are not available, this analysis includes full schema context.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'execution' && (
            <div className="execution-section">
              {!queryDetails ? (
                <div className="empty-state">
                  <BarChart3 size={48} />
                  <h3>No analysis performed</h3>
                  <p>Use the Query Input tab to analyze a SQL query or Job ID</p>
                </div>
              ) : queryDetails.analysis_mode === 'basic' ? (
                <div className="basic-analysis-message">
                  <AlertCircle size={48} />
                  <h3>Execution Plan Not Available</h3>
                  <p>Execution plans are only available for queries that have been executed in BigQuery recently.</p>
                  <p>To get execution plan analysis:</p>
                  <ul>
                    <li>Execute this query in BigQuery Console</li>
                    <li>Use the Job ID from the execution for analysis</li>
                    <li>Or wait for the query to appear in expensive queries if it uses significant resources</li>
                  </ul>
                </div>
              ) : (
                <ExecutionPlanViewer 
                  plan={queryDetails.execution_plan} 
                  summary={queryDetails.execution_plan_summary} 
                />
              )}
            </div>
          )}

          {activeTab === 'optimization' && (
            <div className="optimization-section">
              {!queryDetails ? (
                <div className="empty-state">
                  <Zap size={48} />
                  <h3>No analysis performed</h3>
                  <p>Use the Query Input tab to analyze a SQL query or Job ID</p>
                </div>
              ) : (
                <div className="optimization-content">
                  <div className="optimization-header">
                    <h4>AI-Powered Optimization</h4>
                    <button
                      onClick={getOptimizationRecommendations}
                      disabled={loading.recommendations}
                      className="optimize-btn"
                      title="Get AI-powered optimization recommendations"
                    >
                      {loading.recommendations ? (
                        <>
                          <Loader className="spinning" size={16} />
                          Generating Recommendations...
                        </>
                      ) : (
                        'Get AI Recommendations'
                      )}
                    </button>
                  </div>
                  
                  <div className="analysis-info">
                    {queryDetails.analysis_mode === 'basic' && (
                      <div className="analysis-mode-info">
                        <AlertCircle size={16} />
                        <p><strong>Basic Analysis Mode:</strong> Recommendations based on query structure only. For comprehensive optimization with execution data, execute the query in BigQuery first.</p>
                      </div>
                    )}
                    
                    {queryDetails.analysis_mode === 'comprehensive_manual' && (
                      <div className="analysis-mode-info enhanced">
                        <Database size={16} />
                        <p><strong>Comprehensive Schema Analysis Mode:</strong> Recommendations include full table schema analysis and DDL context. While execution data is not available, this provides detailed optimization insights.</p>
                      </div>
                    )}
                    
                    {queryDetails.analysis_mode !== 'basic' && queryDetails.analysis_mode !== 'comprehensive_manual' && (
                      <div className="analysis-mode-info enhanced">
                        <Database size={16} />
                        <p><strong>Enhanced Analysis Mode:</strong> Recommendations include execution plan analysis and performance insights.</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="recommendations-content">
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
          )}
        </div>
      </div>
      
      {isModalOpen && (
        <AIRecommendationsModal 
          recommendations={recommendations}
          onClose={handleCloseModal}
          loading={loading.recommendations}
        />
      )}
    </div>
  );
};

export default ManualQueryAnalyzer;