import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, Clock, Users, Database, AlertTriangle
} from 'lucide-react';
import axios from 'axios';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

const API_BASE = Config.API_BASE_URL;

const TimeWindowInvestigation = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [dashboardData, setDashboardData] = useState(null);
  const [timeRange, setTimeRange] = useState(Config.DEFAULT_TIME_RANGE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, [timeRange, selectedProject, selectedRegion]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/operational-dashboard?timeRange=${timeRange}&project=${selectedProject}&region=${selectedRegion}`);
      setDashboardData(response.data);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setDashboardData({
        kpis: {
          slotUsage: { current: 0, max: 2000, unit: 'slots' },
          jobConcurrency: { current: 0, max: 100, unit: 'jobs' },
          errors: { count: 0, percentage: 0 },
          avgJobDuration: { value: 0, unit: 'minutes' },
          bytesProcessed: { value: 0, unit: 'TB' },
          totalJobs: { value: 0, unit: 'jobs' },
          activeUsers: { value: 0, unit: 'users' }
        },
        slotUsageChart: [],
        jobDurationChart: [],
        bytesProcessedChart: [],
        errorBreakdown: [],
        topUsers: []
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loader"></div>;
  }

  const { kpis, slotUsageChart, jobDurationChart, bytesProcessedChart, errorBreakdown, topUsers } = dashboardData;

  return (
    <div className="time-window-investigation">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h1>Time Window Investigation</h1>
            <p>Analyze BigQuery performance and resource usage patterns over time</p>
          </div>
        </div>
        <FilterControls 
          onRefresh={fetchDashboardData}
          loading={loading}
          showTimeRange={true}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          timeRangeOptions={Config.TIME_RANGE_OPTIONS}
        />
      </div>

      {/* Time Indicator */}
      <div className="time-indicator">
        <span>Data for the last {timeRange === '1h' ? 'complete day' : timeRange}</span>
      </div>

      {/* Main Content Grid */}
      <div className="investigation-grid">
        {/* Jobs Created by Hour */}
        <div className="chart-section large">
          <div className="section-header">
            <h3>Jobs Created by Hour</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={slotUsageChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                  axisLine={{ stroke: '#e0e0e0' }}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                  axisLine={{ stroke: '#e0e0e0' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e0e0e0',
                    borderRadius: '4px'
                  }}
                />
                <Area 
                  type="monotone" 
                  dataKey="jobs" 
                  stroke="#4285f4" 
                  fill="#4285f4" 
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Job Types Summary */}
        <div className="summary-section">
          <div className="section-header">
            <h3>Job Types</h3>
          </div>
          <div className="job-types-summary">
            <div className="job-type-row header">
              <span>Job Type</span>
              <span>Jobs</span>
              <span>Avg Duration</span>
            </div>
            <div className="job-type-row">
              <span className="job-type">QUERY</span>
              <span className="job-count">{kpis.totalJobs.value.toLocaleString()}</span>
              <span className="job-duration">{kpis.avgJobDuration.value}m</span>
            </div>
            <div className="job-type-row">
              <span className="job-type">LOAD</span>
              <span className="job-count">-</span>
              <span className="job-duration">-</span>
            </div>
            <div className="job-type-row">
              <span className="job-type">EXTRACT</span>
              <span className="job-count">-</span>
              <span className="job-duration">-</span>
            </div>
          </div>
        </div>

        {/* Key Metrics Cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">
              <Database />
            </div>
            <div className="metric-content">
              <div className="metric-value">{kpis.bytesProcessed.value}</div>
              <div className="metric-unit">{kpis.bytesProcessed.unit} Processed</div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <Users />
            </div>
            <div className="metric-content">
              <div className="metric-value">{kpis.activeUsers.value}</div>
              <div className="metric-unit">Active Users</div>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">
              <Clock />
            </div>
            <div className="metric-content">
              <div className="metric-value">{kpis.avgJobDuration.value}</div>
              <div className="metric-unit">Avg Duration (min)</div>
            </div>
          </div>

          <div className="metric-card error">
            <div className="metric-icon">
              <AlertTriangle />
            </div>
            <div className="metric-content">
              <div className="metric-value">{kpis.errors.count}</div>
              <div className="metric-unit">Errors ({kpis.errors.percentage}%)</div>
            </div>
          </div>
        </div>

        {/* Detailed Charts */}
        <div className="chart-section">
          <div className="section-header">
            <h3>Slot Usage Over Time</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={slotUsageChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="time" 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                />
                <Tooltip />
                <Line 
                  type="monotone" 
                  dataKey="slots" 
                  stroke="#34a853" 
                  strokeWidth={2}
                  dot={{ fill: '#34a853', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="chart-section">
          <div className="section-header">
            <h3>Job Duration Distribution</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={jobDurationChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                <XAxis 
                  dataKey="duration_bucket" 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                />
                <YAxis 
                  tick={{ fontSize: 12, fill: '#9aa0a6' }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#4285f4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Users Table */}
        {topUsers.length > 0 && (
          <div className="users-section">
            <div className="section-header">
              <h3>Top Users by Activity</h3>
            </div>
            <div className="users-table">
              <div className="table-header">
                <span>User</span>
                <span>Queries</span>
                <span>Slot Hours</span>
                <span>GB Processed</span>
              </div>
              {topUsers.slice(0, 5).map((user, index) => (
                <div key={user.user_email || index} className="table-row">
                  <span className="user-email">{user.user_email}</span>
                  <span className="user-queries">{user.query_count}</span>
                  <span className="user-slot-hours">{Math.round(user.slot_hours * 100) / 100}</span>
                  <span className="user-gb-processed">{Math.round(user.gb_processed * 100) / 100}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Error Breakdown */}
        {errorBreakdown.length > 0 && (
          <div className="chart-section">
            <div className="section-header">
              <h3>Error Breakdown</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={errorBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {errorBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeWindowInvestigation;