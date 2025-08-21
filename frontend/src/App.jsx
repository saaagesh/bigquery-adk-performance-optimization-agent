import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import Layout from './components/Layout';
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
            <Route path="/" element={<OrganizationOverview />} />
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
