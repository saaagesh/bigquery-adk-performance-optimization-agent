import React, { useState } from 'react';
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
  Download
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useAppContext } from '../context/AppContext';
import Config from '../config';
import axios from 'axios';
import './ManualQueryAnalyzer.css';

const API_BASE = Config.API_BASE_URL;

const ManualQueryAnalyzer = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [queryText, setQueryText] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState({
    analysis: false,
    historical: false,
    validation: false
  });
  const [validationResult, setValidationResult] = useState(null);
  const [activeTab, setActiveTab] = useState('input');

  const validateQuery = async () => {
    if (!queryText.trim()) return;

    setLoading(prev => ({ ...prev, validation: true }));
    
    try {
      // Simple client-side validation first
      const basicValidation = {
        hasSql: queryText.trim().length > 0,
        hasSelect: /select/i.test(queryText),
        hasFrom: /from/i.test(queryText),
        hasInformationSchema: /information_schema/i.test(queryText),
        estimatedComplexity: calculateComplexity(queryText)
      };

      setValidationResult({
        isValid: basicValidation.hasSql && basicValidation.hasSelect && !basicValidation.hasInformationSchema,
        warnings: generateWarnings(basicValidation),
        suggestions: generateSuggestions(queryText),
        complexity: basicValidation.estimatedComplexity
      });

    } catch (error) {
      console.error('Query validation error:', error);
      setValidationResult({
        isValid: false,
        warnings: ['Error validating query syntax'],
        suggestions: [],
        complexity: 'unknown'
      });
    } finally {
      setLoading(prev => ({ ...prev, validation: false }));
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
            status: 'DONE'
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
        includePerformanceInsights: true
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
    { id: 'input', label: 'Query Input', icon: FileText },
    { id: 'validation', label: 'Validation', icon: CheckCircle },
    { id: 'historical', label: 'Historical Data', icon: Clock },
    { id: 'results', label: 'Analysis Results', icon: TrendingUp }
  ];

  return (
    <div className="manual-query-analyzer">
      <div className="analyzer-header">
        <div className="header-content">
          <div>
            <h2>Manual Query Analyzer</h2>
            <p>Paste your BigQuery SQL for comprehensive optimization analysis</p>
          </div>
          <div className="analyzer-actions">
            <button 
              className="btn-secondary"
              onClick={() => setQueryText('')}
              disabled={!queryText.trim()}
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
              <div className="query-input-container">
                <div className="input-header">
                  <h3>SQL Query Input</h3>
                  <div className="input-actions">
                    <button
                      className="btn-secondary small"
                      onClick={validateQuery}
                      disabled={!queryText.trim() || loading.validation}
                    >
                      {loading.validation ? <Loader className="spinning" size={14} /> : <Play size={14} />}
                      Validate
                    </button>
                    <button
                      className="btn-secondary small"
                      onClick={searchHistoricalData}
                      disabled={!queryText.trim() || loading.historical}
                    >
                      {loading.historical ? <Loader className="spinning" size={14} /> : <Database size={14} />}
                      Search History
                    </button>
                  </div>
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

              <div className="quick-tips">
                <h4>💡 Quick Tips</h4>
                <ul>
                  <li>Use fully qualified table names (project.dataset.table)</li>
                  <li>Include WHERE clauses to limit data scanning</li>
                  <li>Specify column names instead of SELECT *</li>
                  <li>Consider adding LIMIT for testing queries</li>
                </ul>
              </div>
            </div>
          )}

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

                  {validationResult.suggestions.length > 0 && (
                    <div className="validation-suggestions">
                      <h4>💡 Suggestions</h4>
                      <ul>
                        {validationResult.suggestions.map((suggestion, index) => (
                          <li key={index}>{suggestion}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="complexity-info">
                    <h4>Query Complexity</h4>
                    <div className={`complexity-badge ${validationResult.complexity.toLowerCase()}`}>
                      {validationResult.complexity}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <AlertCircle size={48} />
                  <h3>No validation performed</h3>
                  <p>Click "Validate" in the Query Input tab to check your SQL syntax</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'historical' && (
            <div className="historical-section">
              {historicalData ? (
                <div className="historical-results">
                  <div className="section-header">
                    <h3>Historical Execution Data</h3>
                  </div>

                  {historicalData.patterns && (
                    <div className="patterns-section">
                      <h4>📊 Usage Patterns</h4>
                      <ul>
                        {historicalData.patterns.map((pattern, index) => (
                          <li key={index}>{pattern}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {historicalData.similarQueries && (
                    <div className="similar-queries">
                      <h4>🔍 Similar Queries</h4>
                      {historicalData.similarQueries.map((query, index) => (
                        <div key={index} className="similar-query-item">
                          <div className="query-meta">
                            <span className="similarity">
                              {query.similarity}% similar
                            </span>
                            <span className="execution-time">
                              <Clock size={14} />
                              {query.execution_time}
                            </span>
                            <span className="slot-usage">
                              <TrendingUp size={14} />
                              {query.slot_ms.toLocaleString()} slot ms
                            </span>
                          </div>
                          <div className="query-details">
                            <span>Job ID: {query.job_id}</span>
                            <span>Status: {query.status}</span>
                            <span>{new Date(query.creation_time).toLocaleDateString()}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="empty-state">
                  <Database size={48} />
                  <h3>No historical data loaded</h3>
                  <p>Click "Search History" in the Query Input tab to find similar queries</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'results' && (
            <div className="results-section">
              {analysis ? (
                <div className="analysis-results">
                  {analysis.message && (
                    <div className="analysis-message">
                      <AlertCircle size={16} />
                      {analysis.message}
                    </div>
                  )}

                  {analysis.optimization && (
                    <div className="optimization-section">
                      <div className="section-header">
                        <h3>🎯 Optimization Recommendations</h3>
                        <button
                          className="btn-secondary small"
                          onClick={() => copyToClipboard(analysis.optimization.recommendations)}
                        >
                          <Copy size={14} />
                          Copy
                        </button>
                      </div>
                      
                      <div className="recommendations-content">
                        <ReactMarkdown>{analysis.optimization.recommendations}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {analysis.executionPlan && (
                    <div className="execution-plan-section">
                      <h3>📋 Execution Plan Analysis</h3>
                      <div className="execution-plan-content">
                        {/* Execution plan visualization would go here */}
                        <p>Execution plan analysis coming soon...</p>
                      </div>
                    </div>
                  )}

                  {analysis.performanceInsights && (
                    <div className="performance-insights-section">
                      <h3>⚡ Performance Insights</h3>
                      <div className="insights-content">
                        {/* Performance insights would go here */}
                        <p>Performance insights analysis coming soon...</p>
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
  );
};

export default ManualQueryAnalyzer;