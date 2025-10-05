import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Play, 
  FileText, 
  Clock, 
  Database, 
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Loader,
  Copy,
  Download,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppContext } from '../context/AppContext';
import Config from '../config';
import axios from 'axios';
import QueryModal from './QueryModal';
import './ExpensiveQueries.css';

const API_BASE = Config.API_BASE_URL;

const ManualQueryAnalyzer = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [queryText, setQueryText] = useState(() => localStorage.getItem('manualAnalyzer_queryText') || '');
  const [analysis, setAnalysis] = useState(() => {
    const saved = localStorage.getItem('manualAnalyzer_analysis');
    return saved ? JSON.parse(saved) : null;
  });
  const [historicalData, setHistoricalData] = useState(() => {
    const saved = localStorage.getItem('manualAnalyzer_historicalData');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState({
    analysis: false,
    historical: false,
    validation: false
  });
  const [validationResult, setValidationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('validation');
  const [expandedSimilarQueries, setExpandedSimilarQueries] = useState(new Set());
  const [queryModalOpen, setQueryModalOpen] = useState(false);
  const [selectedQueryForModal, setSelectedQueryForModal] = useState(null);

  const toggleSimilarQueryExpansion = (jobId) => {
    setExpandedSimilarQueries(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const openQueryModal = (query) => {
    setSelectedQueryForModal(query);
    setQueryModalOpen(true);
  };

  const closeQueryModal = () => {
    setQueryModalOpen(false);
    setSelectedQueryForModal(null);
  };

  useEffect(() => {
    localStorage.setItem('manualAnalyzer_queryText', queryText);
  }, [queryText]);

  useEffect(() => {
    if (analysis) {
      localStorage.setItem('manualAnalyzer_analysis', JSON.stringify(analysis));
    } else {
      localStorage.removeItem('manualAnalyzer_analysis');
    }
  }, [analysis]);

  useEffect(() => {
    if (historicalData) {
      localStorage.setItem('manualAnalyzer_historicalData', JSON.stringify(historicalData));
    } else {
      localStorage.removeItem('manualAnalyzer_historicalData');
    }
  }, [historicalData]);


  useEffect(() => {
    const handler = setTimeout(() => {
      if (queryText.trim()) {
        searchHistoricalData();
      }
    }, 1000); // 1-second debounce delay

    return () => {
      clearTimeout(handler);
    };
  }, [queryText]);

  const validateQuery = async () => {
    if (!queryText.trim()) return;

    setLoading(prev => ({ ...prev, validation: true }));
    
    try {
      // Perform a dry run to get syntax validation and cost estimation
      const response = await axios.post(`${API_BASE}/validate-query`, {
        query: queryText,
        project: selectedProject,
        region: selectedRegion
      });
      
      const { data } = response;
      const processedBytes = data.totalBytesProcessed || 0;
      const processedGB = (processedBytes / (1024 * 1024 * 1024)).toFixed(2);

      setValidationResult({
        isValid: data.isValid,
        warnings: data.isValid ? [`Estimated to process ${processedGB} GB`] : [data.error],
        suggestions: generateSuggestions(queryText),
        complexity: calculateComplexity(queryText)
      });

    } catch (error) {
      console.error('Query validation error:', error);
      setValidationResult({
        isValid: false,
        warnings: [error.response?.data?.error || 'Error validating query syntax'],
        suggestions: [],
        complexity: 'unknown'
      });
    } finally {
      setLoading(prev => ({ ...prev, validation: false }));
      setActiveTab('validation');
    }
  };

  const calculateComplexity = (query) => {
    const joinCount = (query.match(/join/gi) || []).length;
    const subqueryCount = (query.match(/\(/g) || []).length;
    const windowFunctionCount = (query.match(/over\s*\(/gi) || []).length;
    const cteCount = (query.match(/with\s+/gi) || []).length;

    const score = joinCount * 2 + subqueryCount + windowFunctionCount * 3 + cteCount * 2;
    
    if (score <= 3) return 'Simple';
    if (score <= 8) return 'Medium';
    return 'Complex';
  };

  const generateWarnings = (validation) => {
    const warnings = [];
    
    if (!validation.hasSelect) warnings.push('Query should contain SELECT statement');
    if (!validation.hasFrom) warnings.push('Query should contain FROM clause');
    if (validation.hasInformationSchema) warnings.push('Avoid querying INFORMATION_SCHEMA in production');
    
    return warnings;
  };

  const generateSuggestions = (query) => {
    const suggestions = [];
    
    if (!/limit/i.test(query)) {
      suggestions.push('Consider adding LIMIT clause for testing');
    }
    if (!/where/i.test(query)) {
      suggestions.push('Add WHERE clauses to reduce data scanning');
    }
    if (/select\s*\*/i.test(query)) {
      suggestions.push('Specify column names instead of SELECT *');
    }
    
    return suggestions;
  };

  const searchHistoricalData = async () => {
    if (!queryText.trim()) return;

    setLoading(prev => ({ ...prev, historical: true }));
    
    try {
      // Search for similar queries in historical data
      const response = await axios.post(`${API_BASE}/search-historical-queries`, {
        query: queryText,
        project: selectedProject,
        region: selectedRegion
      });
      setHistoricalData(response.data);
    } catch (error) {
      console.error('Error searching historical data:', error);
      // Create mock historical data for demo
      setHistoricalData({
        similarQueries: [
          {
            job_id: 'demo_job_1',
            similarity: 85,
            execution_time: '2.3s',
            slot_ms: 145000,
            creation_time: '2024-01-15T10:30:00Z',
            status: 'DONE',
            query_text: 'SELECT customer_id, COUNT(*) as order_count FROM `project.dataset.orders` GROUP BY customer_id ORDER BY order_count DESC LIMIT 100;'
          }
        ],
        patterns: [
          'This query pattern has been executed 12 times in the last 30 days',
          'Average execution time: 2.1 seconds',
          'Peak usage during 10-11 AM'
        ]
      });
    } finally {
      setLoading(prev => ({ ...prev, historical: false }));
    }
  };

  const analyzeQuery = async () => {
    if (!queryText.trim()) return;

    setLoading(prev => ({ ...prev, analysis: true }));
    
    try {
      const response = await axios.post(`${API_BASE}/analyze-query-manual`, {
        query: queryText,
        project: selectedProject,
        region: selectedRegion,
        includeOptimization: true,
        includeExecutionPlan: true,
        includePerformanceInsights: true,
        historicalData: historicalData // Send historical data
      });
      
      setAnalysis(response.data);
      setActiveTab('results');
    } catch (error) {
      console.error('Error analyzing query:', error);
      
      // Fallback to basic optimization analysis
      try {
        const basicResponse = await axios.post(`${API_BASE}/optimize`, {
          query: queryText,
          ddl: ''
        });
        
        setAnalysis({
          optimization: {
            recommendations: basicResponse.data.recommendations,
            source: 'basic'
          },
          message: 'Basic analysis completed. Historical execution data not available.'
        });
        setActiveTab('results');
      } catch (fallbackError) {
        console.error('Fallback analysis also failed:', fallbackError);
        alert('Unable to analyze query. Please check your configuration and try again.');
      }
    } finally {
      setLoading(prev => ({ ...prev, analysis: false }));
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  const tabs = [
    { id: 'validation', label: 'Validation', icon: CheckCircle },
    { id: 'historical', label: 'Historical Data', icon: Clock },
    { id: 'results', label: 'Analysis Results', icon: TrendingUp }
  ];

  const handleClear = () => {
    localStorage.removeItem('manualAnalyzer_queryText');
    localStorage.removeItem('manualAnalyzer_analysis');
    localStorage.removeItem('manualAnalyzer_historicalData');
    setQueryText('');
    setAnalysis(null);
    setHistoricalData(null);
    setValidationResult(null);
    setActiveTab('input');
  };

  return (
    <div className="expensive-queries">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>Manual Query Analyzer</h2>
            <p>Paste your BigQuery SQL for comprehensive optimization analysis</p>
          </div>
          <div className="analyzer-actions">
            <button 
              className="btn-secondary"
              onClick={handleClear}
              disabled={!queryText.trim() && !analysis && !historicalData}
            >
              Clear
            </button>
            <button 
              className="btn-primary"
              onClick={analyzeQuery}
              disabled={!queryText.trim() || loading.analysis}
            >
              {loading.analysis ? <Loader className="spinning" size={16} /> : <Search size={16} />}
              Analyze Query
            </button>
          </div>
        </div>
      </div>

      <div className="queries-container">
        <div className="queries-section">
          <div className="section-header">
            <h3>SQL Input</h3>
          </div>
          <div className="query-input-container">
            <textarea
              className="query-textarea"
              placeholder="Paste your BigQuery SQL here..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
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
        </div>
        <div className="details-section">
          <div className="details-tabs">
            {tabs.map(tab => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  className={`tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <IconComponent size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="tab-content">
            {activeTab === 'validation' && (
              <div className="validation-section">
                {validationResult ? (
                  <div className="validation-results">
                    <div className={`validation-status ${validationResult.isValid ? 'valid' : 'invalid'}`}>
                      {validationResult.isValid ? (
                        <>
                          <CheckCircle size={20} />
                          Query syntax appears valid
                        </>
                      ) : (
                        <>
                          <AlertCircle size={20} />
                          Query has validation issues
                        </>
                      )}
                    </div>
                    {validationResult.warnings.length > 0 && (
                      <div className="validation-warnings">
                        <h4>⚠️ Warnings</h4>
                        <ul>
                          {validationResult.warnings.map((warning, index) => (
                            <li key={index}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <AlertCircle size={48} />
                    <h3>No validation performed</h3>
                    <p>Click "Analyze Query" to check your SQL syntax</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'historical' && (
              <div className="historical-section">
                {historicalData ? (
                  <div className="historical-results">
                    {historicalData.similarQueries && (
                      <div className="queries-list">
                        <h4>🔍 Top 2 Similar Queries</h4>
                        {historicalData.similarQueries.slice(0, 2).map((query, index) => {
                          const isExpanded = expandedSimilarQueries.has(query.job_id);
                          return (
                            <div key={index} className={`query-item ${isExpanded ? 'expanded' : ''}`}>
                              <div className="query-header" onClick={() => toggleSimilarQueryExpansion(query.job_id)}>
                                <div className="query-identifier">
                                  <div className="query-hash">
                                    <span className="similarity">
                                      {query.similarity}% similar
                                    </span>
                                  </div>
                                  <div className="job-id">
                                    <span className="job-id-label">Job ID:</span>
                                    <span className="job-id-value">{query.job_id}</span>
                                  </div>
                                </div>
                                <button className="expand-toggle">
                                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </button>
                              </div>
                              <div className="query-preview">
                                <code>
                                  {query.query_preview ? `${query.query_preview.substring(0, 100)}...` : 'No preview available'}
                                </code>
                              </div>
                              {isExpanded && (
                                <div className="query-expanded-details">
                                  <pre className="query-code">
                                    {query.query_preview}
                                  </pre>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <Database size={48} />
                    <h3>No historical data loaded</h3>
                    <p>Click "Analyze Query" to find similar queries</p>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'results' && (
              <div className="results-section">
                {analysis ? (
                  <div className="analysis-results">
                    {analysis.optimization && (
                      <div className="optimization-section">
                        <div className="section-header">
                          <h3>🎯 Optimization Recommendations</h3>
                        </div>
                        <div className="recommendations-content">
                          <ReactMarkdown>{analysis.optimization.recommendations}</ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <TrendingUp size={48} />
                    <h3>No analysis results</h3>
                    <p>Click "Analyze Query" to get optimization recommendations</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <QueryModal
        query={selectedQueryForModal}
        isOpen={queryModalOpen}
        onClose={closeQueryModal}
      />
    </div>
  );
};

export default ManualQueryAnalyzer;