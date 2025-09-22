import React, { useState } from 'react';
import {
  BookOpen,
  CheckCircle,
  Circle,
  ArrowRight,
  Target,
  BarChart3,
  Database,
  Zap,
  Settings,
  Play
} from 'lucide-react';
import './GuidedWorkflow.css';

const GuidedWorkflow = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState(new Set());

  const workflowSteps = [
    {
      id: 1,
      title: 'Query Assessment & Baseline Metrics',
      description: 'Analyze your current query performance and establish baseline metrics',
      icon: BarChart3,
      tasks: [
        'Review query execution statistics',
        'Identify performance bottlenecks', 
        'Establish current cost baseline',
        'Document query complexity'
      ],
      estimatedTime: '10-15 minutes'
    },
    {
      id: 2,
      title: 'Data Access Pattern Analysis',
      description: 'Examine how your query accesses and processes data',
      icon: Database,
      tasks: [
        'Analyze table scanning patterns',
        'Review JOIN operations',
        'Identify unnecessary data retrieval',
        'Check filter effectiveness'
      ],
      estimatedTime: '15-20 minutes'
    },
    {
      id: 3,
      title: 'Compute Resource Optimization',
      description: 'Optimize slot usage and computational efficiency',
      icon: Zap,
      tasks: [
        'Analyze slot utilization patterns',
        'Identify parallelization opportunities',
        'Optimize aggregation strategies',
        'Review window function usage'
      ],
      estimatedTime: '20-25 minutes'
    },
    {
      id: 4,
      title: 'Storage Organization Review',
      description: 'Examine and optimize data organization strategies',
      icon: Settings,
      tasks: [
        'Review partitioning strategy',
        'Analyze clustering effectiveness',
        'Check data type optimization',
        'Evaluate archival opportunities'
      ],
      estimatedTime: '15-20 minutes'
    },
    {
      id: 5,
      title: 'Implementation Planning',
      description: 'Create actionable optimization implementation plan',
      icon: Target,
      tasks: [
        'Prioritize optimization opportunities',
        'Create implementation timeline',
        'Identify risks and dependencies',
        'Prepare rollback strategies'
      ],
      estimatedTime: '10-15 minutes'
    },
    {
      id: 6,
      title: 'Performance Validation',
      description: 'Test and validate optimization improvements',
      icon: CheckCircle,
      tasks: [
        'Execute optimized queries',
        'Compare performance metrics',
        'Validate cost improvements',
        'Document lessons learned'
      ],
      estimatedTime: '15-20 minutes'
    }
  ];

  const handleStartStep = (stepId) => {
    setCurrentStep(stepId);
  };

  const handleCompleteStep = (stepId) => {
    const newCompleted = new Set(completedSteps);
    newCompleted.add(stepId);
    setCompletedSteps(newCompleted);
    
    // Auto-advance to next step
    if (stepId < workflowSteps.length) {
      setCurrentStep(stepId + 1);
    }
  };

  const currentStepData = workflowSteps.find(step => step.id === currentStep);
  const progress = (completedSteps.size / workflowSteps.length) * 100;

  return (
    <div className="guided-workflow">
      <div className="workflow-header">
        <div className="header-content">
          <div>
            <h2>Guided Query Optimization Workflow</h2>
            <p>Step-by-step process to systematically optimize your BigQuery queries</p>
          </div>
          <div className="workflow-progress">
            <div className="progress-circle">
              <svg width="60" height="60" viewBox="0 0 60 60">
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke="#e9ecef"
                  strokeWidth="4"
                />
                <circle
                  cx="30"
                  cy="30"
                  r="25"
                  fill="none"
                  stroke="#667eea"
                  strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 25}`}
                  strokeDashoffset={`${2 * Math.PI * 25 * (1 - progress / 100)}`}
                  transform="rotate(-90 30 30)"
                />
              </svg>
              <div className="progress-text">
                <span className="progress-percentage">{Math.round(progress)}%</span>
              </div>
            </div>
            <div className="progress-info">
              <span className="steps-completed">{completedSteps.size} of {workflowSteps.length} steps</span>
              <span className="estimated-time">~85 minutes total</span>
            </div>
          </div>
        </div>
      </div>

      <div className="workflow-content">
        {/* Steps Sidebar */}
        <div className="workflow-sidebar">
          <div className="sidebar-header">
            <h3>Optimization Steps</h3>
          </div>
          <div className="steps-list">
            {workflowSteps.map((step, index) => {
              const IconComponent = step.icon;
              const isCompleted = completedSteps.has(step.id);
              const isCurrent = currentStep === step.id;
              const isAvailable = step.id === 1 || completedSteps.has(step.id - 1);
              
              return (
                <div 
                  key={step.id} 
                  className={`step-item ${
                    isCompleted ? 'completed' : 
                    isCurrent ? 'current' : 
                    isAvailable ? 'available' : 'locked'
                  }`}
                  onClick={() => isAvailable && handleStartStep(step.id)}
                >
                  <div className="step-indicator">
                    {isCompleted ? (
                      <CheckCircle size={20} />
                    ) : (
                      <Circle size={20} />
                    )}
                  </div>
                  
                  <div className="step-content">
                    <div className="step-header">
                      <IconComponent size={16} />
                      <span className="step-number">Step {step.id}</span>
                    </div>
                    <h4>{step.title}</h4>
                    <p>{step.description}</p>
                    <div className="step-time">
                      ⏱️ {step.estimatedTime}
                    </div>
                  </div>
                  
                  {isCurrent && (
                    <ArrowRight size={16} className="current-indicator" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="workflow-main">
          {currentStepData ? (
            <div className="step-detail">
              <div className="step-detail-header">
                <div className="step-info">
                  <div className="step-badge">
                    Step {currentStepData.id} of {workflowSteps.length}
                  </div>
                  <h3>{currentStepData.title}</h3>
                  <p>{currentStepData.description}</p>
                </div>
                
                <div className="step-actions">
                  {!completedSteps.has(currentStepData.id) && (
                    <button
                      className="btn-primary"
                      onClick={() => handleCompleteStep(currentStepData.id)}
                    >
                      <Play size={16} />
                      Start Step
                    </button>
                  )}
                </div>
              </div>

              <div className="step-detail-content">
                <div className="tasks-section">
                  <h4>Tasks for this step:</h4>
                  <ul className="tasks-list">
                    {currentStepData.tasks.map((task, index) => (
                      <li key={index} className="task-item">
                        <Target size={14} />
                        {task}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="step-guidance">
                  <h4>Detailed Guidance</h4>
                  <div className="guidance-content">
                    {currentStepData.id === 1 && (
                      <div className="guidance-text">
                        <p><strong>Query Assessment</strong> is the foundation of optimization. In this step, you'll:</p>
                        <ul>
                          <li>Review your query's current performance metrics (slot time, duration, bytes processed)</li>
                          <li>Understand the query's complexity and identify potential bottlenecks</li>
                          <li>Establish baseline costs for comparison after optimization</li>
                          <li>Document the query's business purpose and requirements</li>
                        </ul>
                        <div className="pro-tip">
                          <strong>💡 Pro Tip:</strong> Use the "Top Expensive Queries" feature to identify queries that will benefit most from optimization.
                        </div>
                      </div>
                    )}
                    
                    {currentStepData.id === 2 && (
                      <div className="guidance-text">
                        <p><strong>Data Access Analysis</strong> focuses on how efficiently your query reads data:</p>
                        <ul>
                          <li>Check if you're scanning unnecessary columns (avoid SELECT *)</li>
                          <li>Verify that WHERE clauses are properly placed and indexed</li>
                          <li>Review JOIN conditions for efficiency</li>
                          <li>Identify opportunities for predicate pushdown</li>
                        </ul>
                        <div className="pro-tip">
                          <strong>💡 Pro Tip:</strong> BigQuery processes data columnarly, so selecting only needed columns can dramatically reduce costs.
                        </div>
                      </div>
                    )}
                    
                    {currentStepData.id > 2 && (
                      <div className="guidance-placeholder">
                        <p>Detailed guidance for this step will be implemented based on BigQuery best practices and real-world optimization patterns.</p>
                        <p>This will include specific techniques, code examples, and interactive tools to guide you through the optimization process.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="workflow-start">
              <BookOpen size={64} />
              <h3>Ready to Optimize Your Queries?</h3>
              <p>Follow our guided 6-step workflow to systematically improve your BigQuery query performance and reduce costs.</p>
              <button
                className="btn-primary large"
                onClick={() => handleStartStep(1)}
              >
                <Play size={20} />
                Start Optimization Workflow
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GuidedWorkflow;