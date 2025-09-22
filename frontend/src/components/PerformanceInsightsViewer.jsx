import React from 'react';
import { Target, AlertTriangle, Info, TrendingUp } from 'lucide-react';
import './ExpensiveQueries.css'; // Re-use existing CSS

const PerformanceInsightsViewer = ({ insights }) => {
  console.log('PerformanceInsightsViewer received insights:', insights);
  
  if (!insights) {
    return (
      <div className="no-data">
        <Target size={48} />
        <p>Performance insights data not available for this query</p>
        <small>Detailed performance metrics may require additional BigQuery monitoring setup.</small>
      </div>
    );
  }

  // Handle new performance insights structure
  if (insights.available === false) {
    return (
      <div className="no-data">
        <Target size={48} />
        <p>{insights.message || 'No performance insights available for this query'}</p>
        {insights.error && (
          <small style={{color: '#d93025'}}>Error: {insights.error}</small>
        )}
      </div>
    );
  }

  // New structure from INFORMATION_SCHEMA
  if (insights.available === true) {
    const { 
      stage_performance_standalone_insights = [], 
      stage_performance_change_insights = [], 
      recommendations = [], 
      warnings = [], 
      slot_contention_detected = false,
      insufficient_shuffle_quota_detected = false,
      raw_data
    } = insights;

    return (
      <div className="performance-insights-viewer">
        <h3>Query Performance Insights</h3>
        
        {/* Debug info */}
        {raw_data && (
          <div className="insight-section" style={{background: '#f8f9fa', padding: '10px', borderRadius: '4px', marginBottom: '16px'}}>
            <h4>🔍 Debug Information</h4>
            <details>
              <summary>Raw Performance Insights Data</summary>
              <pre style={{fontSize: '12px', overflow: 'auto'}}>{raw_data}</pre>
            </details>
          </div>
        )}

        {/* Slot contention detected */}
        {slot_contention_detected && (
          <div className="insight-section warning-section">
            <h4><AlertTriangle size={18} /> Slot Contention Detected</h4>
            <p>⚠️ Your query experienced slot contention, which can significantly impact performance.</p>
          </div>
        )}

        {/* Shuffle quota issues */}
        {insufficient_shuffle_quota_detected && (
          <div className="insight-section warning-section">
            <h4><AlertTriangle size={18} /> Shuffle Quota Issues</h4>
            <p>⚠️ Insufficient shuffle quota detected, which may cause query slowdowns.</p>
          </div>
        )}

        {/* Stage-level standalone insights */}
        {stage_performance_standalone_insights && stage_performance_standalone_insights.length > 0 && (
          <div className="insight-section">
            <h4><Info size={18} /> Stage Performance Issues</h4>
            <div className="stage-insights">
              {stage_performance_standalone_insights.map((insight, index) => (
                <div key={index} className="stage-insight-item">
                  <strong>Stage {insight.stage_id}:</strong>
                  <ul>
                    {insight.slot_contention && <li>🔴 Slot contention detected</li>}
                    {insight.insufficient_shuffle_quota && <li>🟡 Insufficient shuffle quota</li>}
                    {!insight.slot_contention && !insight.insufficient_shuffle_quota && <li>✅ No major issues detected</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stage-level change insights */}
        {stage_performance_change_insights && stage_performance_change_insights.length > 0 && (
          <div className="insight-section">
            <h4><TrendingUp size={18} /> Performance Changes</h4>
            <div className="change-insights">
              {stage_performance_change_insights.map((insight, index) => (
                <div key={index} className="change-insight-item">
                  <strong>Stage {insight.stage_id}:</strong>
                  {insight.input_data_change && insight.input_data_change.records_read_diff_percentage !== null && (
                    <p>Records read changed by <strong>{insight.input_data_change.records_read_diff_percentage > 0 ? '+' : ''}{insight.input_data_change.records_read_diff_percentage.toFixed(1)}%</strong> compared to historical runs</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recommendations && recommendations.length > 0 && (
          <div className="insight-section">
            <h4><Target size={18} /> Optimization Recommendations</h4>
            <ul className="recommendation-list">
              {recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {warnings && warnings.length > 0 && (
          <div className="insight-section warning-section">
            <h4><AlertTriangle size={18} /> Warnings</h4>
            <ul className="warning-list">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* No insights found */}
        {(!stage_performance_standalone_insights || stage_performance_standalone_insights.length === 0) && 
         (!stage_performance_change_insights || stage_performance_change_insights.length === 0) && 
         (!recommendations || recommendations.length === 0) && 
         (!warnings || warnings.length === 0) && (
          <div className="no-data">
            <Target size={48} />
            <p>No specific performance insights available for this query.</p>
            <small>This may be due to the query's simplicity or lack of comparable historical data.</small>
          </div>
        )}
      </div>
    );
  }

  // Legacy structure support (keeping for backward compatibility)
  const { slot_ms_diff, top_resource_contention, recommendations, warnings } = insights;

  return (
    <div className="performance-insights-viewer">
      <h3>Query Performance Insights</h3>

      {slot_ms_diff !== undefined && (
        <div className="insight-section">
          <h4><Info size={18} /> Slot Milliseconds Difference</h4>
          <p>This query used <strong>{slot_ms_diff.toLocaleString()}</strong> more slot milliseconds than similar queries, indicating potential inefficiency.</p>
        </div>
      )}

      {top_resource_contention && top_resource_contention.length > 0 && (
        <div className="insight-section">
          <h4><AlertTriangle size={18} /> Top Resource Contention</h4>
          <ul className="contention-list">
            {top_resource_contention.map((contention, index) => (
              <li key={index}>
                <strong>{contention.type}:</strong> {contention.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      {recommendations && recommendations.length > 0 && (
        <div className="insight-section">
          <h4><Target size={18} /> Optimization Recommendations</h4>
          <ul className="recommendation-list">
            {recommendations.map((rec, index) => (
              <li key={index}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div className="insight-section warning-section">
          <h4><AlertTriangle size={18} /> Warnings</h4>
          <ul className="warning-list">
            {warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {!slot_ms_diff && (!top_resource_contention || top_resource_contention.length === 0) && (!recommendations || recommendations.length === 0) && (!warnings || warnings.length === 0) && (
        <div className="no-data">
          <Target size={48} />
          <p>No specific performance insights available for this query.</p>
          <small>This may be due to the query's simplicity or lack of comparable historical data.</small>
        </div>
      )}
    </div>
  );
};

export default PerformanceInsightsViewer;