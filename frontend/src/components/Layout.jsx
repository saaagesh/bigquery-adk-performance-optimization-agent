import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Database, AlertTriangle, Activity, Zap, Clock } from 'lucide-react';

const Layout = ({ children }) => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Organization Overview', icon: BarChart3 },
    { path: '/pulse', label: 'Pulse', icon: Zap },
    { path: '/time-window', label: 'Time Window Investigation', icon: Clock },
    { path: '/expensive-queries', label: 'Expensive Queries', icon: AlertTriangle },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <Database className="header-icon" />
            <div>
              <h1>BigQuery Analytics Hub</h1>
              <p>Monitor, optimize, and manage your BigQuery resources</p>
            </div>
          </div>
        </div>
      </header>

      <nav className="navigation">
        <div className="nav-container">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className={`nav-item ${location.pathname === path ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;