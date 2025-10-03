import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  BarChart3, 
  Database, 
  AlertTriangle, 
  Activity, 
  Zap, 
  Clock, 
  Target,
  Search,
  BookOpen,
  TrendingUp
} from 'lucide-react';

const Layout = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Query Optimizer', icon: Target },
    { path: '/top-queries', label: 'Top Expensive Queries', icon: TrendingUp },
    { path: '/manual-analyzer', label: 'Manual Analyzer', icon: Search },
    { path: '/etl-interface-search', label: 'ETL Interface Search', icon: Database },
    { path: '/guided-workflow', label: 'Guided Workflow', icon: BookOpen },
    // Legacy items in dropdown or secondary menu
    { path: '/organization', label: 'Organization Overview', icon: BarChart3, legacy: true },
    { path: '/pulse', label: 'Pulse View', icon: Zap, legacy: true },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <Target className="header-icon" />
            <div>
              <h1>BigQuery Query Optimizer</h1>
              <p>Intelligent query optimization with AI-powered insights</p>
            </div>
          </div>
        </div>
      </header>

      <nav className="navigation">
        <div className="nav-container">
          {navItems.filter(item => !item.legacy).map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`nav-item ${location.pathname === path ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
          
          {/* Legacy items dropdown or secondary nav could be added here */}
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;