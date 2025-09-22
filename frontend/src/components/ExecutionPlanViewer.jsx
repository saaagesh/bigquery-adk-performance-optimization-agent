import React from 'react';
import ReactMarkdown from 'react-markdown';
import { BarChart3 } from 'lucide-react';
import './ExpensiveQueries.css'; // Re-use existing CSS or create a new one if needed

const ExecutionPlanViewer = ({ plan, summary }) => {
  console.log('ExecutionPlanViewer component rendering...');
  const effectivePlan = plan || []; // Ensure plan is always an array

  if (effectivePlan.length === 0) {
    return (
      <div className="no-data">
        <BarChart3 size={48} />
        <p>Execution plan data not available for this query</p>
        <small>This information may not be available for older queries or queries executed with limited logging.</small>
      </div>
    );
  }

  return (
    <div className="execution-plan-viewer">
      {console.log('ExecutionPlanViewer received plan:', effectivePlan)}
      {console.log('ExecutionPlanViewer received summary:', summary)}
      {summary && (
        <div className="execution-plan-summary">
          <h3>Gemini's Query Plan Insights</h3>
          <ReactMarkdown>{summary}</ReactMarkdown>
        </div>
      )}

      <h3>Detailed Execution Plan</h3>
      {effectivePlan.map((stage, stageIndex) => {
        console.log(`Rendering stage ${stageIndex}:`, stage);
        const inputBytesDisplay = stage.inputBytes !== 'N/A' ? `${(stage.inputBytes / (1024 * 1024)).toFixed(2)} MB` : 'N/A';
        const outputBytesDisplay = stage.outputBytes !== 'N/A' ? `${(stage.outputBytes / (1024 * 1024)).toFixed(2)} MB` : 'N/A';

        return (
          <div key={stageIndex} className="plan-stage">
            <h4>Stage {stage.id}: {stage.name}</h4>
            <p className="stage-info">
              Status: <span className={`status-${stage.status?.toLowerCase()}`}>{stage.status}</span> |
              Records Read: {stage.recordsRead?.toLocaleString() || 'N/A'} |
              Records Written: {stage.recordsWritten?.toLocaleString() || 'N/A'} |
              Input Bytes: {inputBytesDisplay} |
              Output Bytes: {outputBytesDisplay}
            </p>
            {stage.steps && stage.steps.length > 0 && (
              <ul className="stage-steps">
                {stage.steps.map((step, stepIndex) => (
                  <li key={stepIndex} className="step-item">
                    <strong>{step.kind}:</strong> {step.substeps.join('; ')}
                  </li>
                ))}
              </ul>
            )}
            {stage.shuffledWorkerLeakage && (
              <p className="warning-message">
                <strong>Warning:</strong> Shuffled Worker Leakage detected. This may indicate inefficient data distribution.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ExecutionPlanViewer;