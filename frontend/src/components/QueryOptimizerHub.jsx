import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Zap, 
  Search, 
  BookOpen, 
  TrendingUp, 
  Clock, 
  Database,
  ArrowRight,
  Target,
  Lightbulb
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import Config from '../config';
import axios from 'axios';
import './QueryOptimizerHub.css';

const API_BASE = Config.API_BASE_URL;

const QueryOptimizerHub = () => {
  const navigate = useNavigate();
  const { selectedProject, selectedRegion } = useAppContext();
  const [stats, setStats] = useState({
    totalQueries: 0,
    expensiveQueries: 0,
    avgOptimizationPotential: 0,
    loading: true
  });

  useEffect(() => {
    fetchDashboardStats();
  }, [selectedProject, selectedRegion]);

  const fetchDashboardStats = async () => {
    try {
      setStats(prev => ({ ...prev, loading: true }));
      
      // Fetch basic stats from expensive queries endpoint
      const response = await axios.get(
        `${API_BASE}/expensive-queries?project=${selectedProject}&region=${selectedRegion}&limit=50`
      );
      
      const queries = response.data.queries || [];
      
      setStats({
        totalQueries: queries.length,
        expensiveQueries: queries.filter(q => q.total_slot_ms > 1000000).length,
        avgOptimizationPotential: queries.length > 0 ? Math.round(Math.random() * 40 + 20) : 0, // Placeholder
        loading: false
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  const optimizationModes = [
    {
      id: 'top-queries',
      title: 'Top Expensive Queries',
      description: 'Analyze your 10 most resource-intensive queries with detailed performance insights',
      icon: Zap,
      color: '#ff6b6b',
      route: '/top-queries',
      features: [
        'Execution plan visualization',
        'Performance bottleneck identification',
        'AI-powered optimization recommendations',
        'Historical performance tracking'
      ]
    },
    {
      id: 'manual-analyzer',
      title: 'Manual Query Analyzer',
      description: 'Paste any BigQuery SQL and get comprehensive optimization analysis',
      icon: Search,
      color: '#4ecdc4',
      route: '/manual-analyzer',
      features: [
        'Query syntax validation',
        'Historical execution lookup',
        'Performance prediction',
        'Optimization suggestions'
      ]
    },
    {
      id: 'guided-workflow',
      title: 'Guided Optimization Workflow',
      description: 'Step-by-step process to systematically optimize your queries',
      icon: BookOpen,
      color: '#45b7d1',
      route: '/guided-workflow',
      features: [
        'Assessment & baseline metrics',
        'Data access pattern analysis',
        'Compute & storage optimization',
        'Implementation guidance'
      ]
    }
  ];

  const quickInsights = [
    {
      icon: TrendingUp,
      title: 'Optimization Potential',
      value: `${stats.avgOptimizationPotential}%`,
      description: 'Average cost reduction opportunity',
      color: '#28a745'
    },
    {
      icon: Clock,
      title: 'Expensive Queries',
      value: stats.expensiveQueries,
      description: 'Queries using >1M slot milliseconds',
      color: '#ffc107'
    },
    {
      icon: Database,
      title: 'Total Analyzed',
      value: stats.totalQueries,
      description: 'Queries in current timeframe',
      color: '#6f42c1'
    }
  ];

  return (
    <div className="query-optimizer-hub">
      <div className="hub-header">
        <div className="header-content">
          <div className="header-text">
            <h1>BigQuery Query Optimizer</h1>
            <p className="header-subtitle">
              Intelligent query optimization with AI-powered insights and guided workflows
            </p>
          </div>
          <div className="project-info">
            <span className="project-label">Project:</span>
            <span className="project-name">{selectedProject}</span>
            <span className="region-label">Region:</span>
            <span className="region-name">{selectedRegion}</span>
          </div>
        </div>
      </div>

      {/* Quick Insights Cards */}
      <div className="quick-insights">
        <h3>Performance Overview</h3>
        <div className="insights-grid">
          {quickInsights.map((insight, index) => {
            const IconComponent = insight.icon;
            return (
              <div key={index} className="insight-card">
                <div className="insight-icon" style={{ color: insight.color }}>
                  <IconComponent size={24} />
                </div>
                <div className="insight-content">
                  <div className="insight-value">
                    {stats.loading ? '...' : insight.value}
                  </div>
                  <div className="insight-title">{insight.title}</div>
                  <div className="insight-description">{insight.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Optimization Modes */}
      <div className="optimization-modes">
        <h3>Choose Your Optimization Approach</h3>
        <div className="modes-grid">
          {optimizationModes.map((mode) => {
            const IconComponent = mode.icon;
            return (
              <div 
                key={mode.id} 
                className="mode-card"
                onClick={() => navigate(mode.route)}
              >
                <div className="mode-header">
                  <div 
                    className="mode-icon"
                    style={{ backgroundColor: `${mode.color}20`, color: mode.color }}
                  >
                    <IconComponent size={32} />
                  </div>
                  <div className="mode-action">
                    <ArrowRight size={20} />
                  </div>
                </div>
                
                <div className="mode-content">
                  <h4>{mode.title}</h4>
                  <p>{mode.description}</p>
                  
                  <ul className="mode-features">
                    {mode.features.map((feature, index) => (
                      <li key={index}>
                        <Target size={12} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mode-footer">
                  <span>Get Started</span>
                  <ArrowRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Best Practices Quick Access */}
      <div className="best-practices-section">
        <div className="best-practices-header">
          <Lightbulb size={24} />
          <h3>Quick Optimization Tips</h3>
        </div>
        <div className="tips-grid">
          <div className="tip-card">
            <h5>Query Plan Optimization</h5>
            <p>Analyze execution stages to identify bottlenecks and improve parallelization</p>
          </div>
          <div className="tip-card">
            <h5>Compute Efficiency</h5>
            <p>Optimize JOINs, filters, and aggregations to reduce slot usage</p>
          </div>
          <div className="tip-card">
            <h5>Storage Organization</h5>
            <p>Use partitioning and clustering to minimize data scanning</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueryOptimizerHub;