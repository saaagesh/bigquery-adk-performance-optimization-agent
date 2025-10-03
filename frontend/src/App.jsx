import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
import QueryOptimizerHub from './components/QueryOptimizerHub';
import ExpensiveQueriesAnalyzer from './components/ExpensiveQueriesAnalyzer';
import ManualQueryAnalyzer from './components/ManualQueryAnalyzer';
import ETLInterfaceSearch from './components/ETLInterfaceSearch';
import GuidedWorkflow from './components/GuidedWorkflow';
// Keep existing components for backward compatibility
import OrganizationOverview from './components/OrganizationOverview';
import PulseView from './components/PulseView';
import TimeWindowInvestigation from './components/TimeWindowInvestigation';
import ExpensiveQueries from './components/ExpensiveQueries';
import './App.css';

function App() {
  return (
    <AppProvider>
      <Router>
        <Layout>
          <Routes>
            {/* New Query Optimizer Routes */}
            <Route path="/" element={<QueryOptimizerHub />} />
            <Route path="/query-optimizer" element={<QueryOptimizerHub />} />
            <Route path="/top-queries" element={<ExpensiveQueriesAnalyzer />} />
            <Route path="/manual-analyzer" element={<ManualQueryAnalyzer />} />
            <Route path="/etl-interface-search" element={<ETLInterfaceSearch />} />
            <Route path="/guided-workflow" element={<GuidedWorkflow />} />
            
            {/* Legacy Routes for Backward Compatibility */}
            <Route path="/organization" element={<OrganizationOverview />} />
            <Route path="/pulse" element={<PulseView />} />
            <Route path="/time-window" element={<TimeWindowInvestigation />} />
            <Route path="/expensive-queries" element={<ExpensiveQueries />} />
          </Routes>
        </Layout>
      </Router>
    </AppProvider>
  );
}

export default App;
