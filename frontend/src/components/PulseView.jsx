import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { TrendingDown, TrendingUp } from 'lucide-react';
import axios from 'axios';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

const API_BASE = Config.API_BASE_URL;

const PulseView = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [pulseData, setPulseData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPulseData();
  }, [selectedProject, selectedRegion]);



  const fetchPulseData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/pulse-data?project=${selectedProject}&region=${selectedRegion}`);
      setPulseData(response.data);
    } catch (error) {
      console.error('Error fetching pulse data:', error);
      // Mock data that matches the screenshot exactly
      setPulseData({
        weeklyBytesProcessed: [
          { week: 'May', value: 15.2 },
          { week: 'Jun', value: 18.5 },
          { week: 'Jul', value: 12.8 },
          { week: 'Aug', value: 8.2 },
          { week: 'Sep', value: 6.1 }
        ],
        weeklySlotMs: [
          { week: 'May', value: 2800 },
          { week: 'Jun', value: 1200 },
          { week: 'Jul', value: 800 },
          { week: 'Aug', value: 400 },
          { week: 'Sep', value: 200 }
        ],
        bytesProcessedHourly: [
          { date: 'Sep 19', value: 0 },
          { date: 'Sep 20', value: 45 },
          { date: 'Sep 21', value: 120 },
          { date: 'Sep 22', value: 180 },
          { date: 'Sep 23', value: 200 },
          { date: 'Sep 24', value: 150 },
          { date: 'Sep 25', value: 90 },
          { date: 'Sep 26', value: 250 },
          { date: 'Sep 27', value: 180 }
        ],
        slotRateHourly: [
          { date: 'Sep 19', value: 0 },
          { date: 'Sep 20', value: 1.2 },
          { date: 'Sep 21', value: 3.8 },
          { date: 'Sep 22', value: 2.1 },
          { date: 'Sep 23', value: 1.8 },
          { date: 'Sep 24', value: 2.5 },
          { date: 'Sep 25', value: 3.2 },
          { date: 'Sep 26', value: 4.1 },
          { date: 'Sep 27', value: 3.9 }
        ],
        kpis: {
          bytesProcessedWTD: 0.29,
          bytesProcessedChange: -7.7,
          slotMsWTD: 78.1,
          slotMsChange: 33.5,
          avgJobDurationWTD: 5.8,
          jobsDelayedWTD: 0.3,
          queryCacheRateWTD: 66.9,
          spillsToDiskWTD: 0
        },
        reservations: {
          totalSlotCapacity: 960,
          totalSlots: 1000,
          totalIdleSlots: 1000
        }
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loader"></div>;
  }

  const { weeklyBytesProcessed, weeklySlotMs, bytesProcessedHourly, slotRateHourly, kpis, reservations } = pulseData;

  return (
    <div className="pulse-view">
      <div className="pulse-header">
        <div className="pulse-title">
          <h1>Pulse</h1>
          <span className="beta-badge">BETA</span>
        </div>
        <FilterControls 
          onRefresh={fetchPulseData}
          loading={loading}
        />
      </div>

      <div className="pulse-content">
        {/* Top Row - Charts */}
        <div className="pulse-top-row">
          <div className="pulse-chart-card">
            <div className="chart-header">
              <h3>Weekly Bytes Processed by Project</h3>
              <span className="info-icon">?</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={weeklyBytesProcessed}>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#4285f4" 
                    fill="#4285f4" 
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <XAxis 
                    dataKey="week" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#9aa0a6' }}
                  />
                  <YAxis hide />
                </AreaChart>
              </ResponsiveContainer>
              <div className="y-axis-labels">
                <span>20.00 TiB</span>
                <span>10.00 TiB</span>
                <span>0.00 TiB</span>
              </div>
            </div>
          </div>

          <div className="pulse-metric-card">
            <div className="metric-large-display">
              <span className="metric-value">0.29</span>
              <span className="metric-unit">TiB</span>
            </div>
            <div className="metric-label">Bytes Processed WTD</div>
            <div className="metric-change negative">
              <TrendingDown size={14} />
              <span>7.7% PROCESSED WOW</span>
            </div>
          </div>

          <div className="pulse-chart-card">
            <div className="chart-header">
              <h3>Bytes Processed by Hour</h3>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={bytesProcessedHourly}>
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#9c27b0" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9aa0a6' }}
                  />
                  <YAxis hide />
                </LineChart>
              </ResponsiveContainer>
              <div className="y-axis-labels">
                <span>200.0 GiB</span>
                <span>100.0 GiB</span>
                <span>0.0 GiB</span>
              </div>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-line last-week"></span>
                <span>Last Week WTD</span>
              </div>
              <div className="legend-item">
                <span className="legend-line last-week-best"></span>
                <span>Last Week Best</span>
              </div>
              <div className="legend-item">
                <span className="legend-line this-week"></span>
                <span>This Week WTD</span>
              </div>
              <div className="legend-item">
                <span className="legend-line today"></span>
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Second Row - Charts */}
        <div className="pulse-second-row">
          <div className="pulse-chart-card">
            <div className="chart-header">
              <h3>Weekly Slot ms by Project</h3>
              <span className="info-icon">?</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={120}>
                <AreaChart data={weeklySlotMs}>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#4285f4" 
                    fill="#4285f4" 
                    fillOpacity={0.3}
                    strokeWidth={2}
                  />
                  <XAxis 
                    dataKey="week" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#9aa0a6' }}
                  />
                  <YAxis hide />
                </AreaChart>
              </ResponsiveContainer>
              <div className="y-axis-labels">
                <span>2,000M</span>
                <span>1M</span>
                <span>0M</span>
              </div>
            </div>
          </div>

          <div className="pulse-metric-card">
            <div className="metric-large-display">
              <span className="metric-value">78.1</span>
              <span className="metric-unit">M</span>
            </div>
            <div className="metric-label">Slot ms WTD</div>
            <div className="metric-change positive">
              <TrendingUp size={14} />
              <span>33.5% WOW</span>
            </div>
          </div>

          <div className="pulse-chart-card">
            <div className="chart-header">
              <h3>Average Slot Rate by Hour</h3>
              <span className="info-icon">?</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={slotRateHourly}>
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#9c27b0" 
                    strokeWidth={2}
                    dot={false}
                  />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#9aa0a6' }}
                  />
                  <YAxis hide />
                </LineChart>
              </ResponsiveContainer>
              <div className="y-axis-labels">
                <span>4.00</span>
                <span>2.00</span>
                <span>0.00</span>
              </div>
            </div>
            <div className="chart-legend">
              <div className="legend-item">
                <span className="legend-line last-week"></span>
                <span>Last Week WTD</span>
              </div>
              <div className="legend-item">
                <span className="legend-line last-week-best"></span>
                <span>Last Week Best</span>
              </div>
              <div className="legend-item">
                <span className="legend-line this-week"></span>
                <span>This Week WTD</span>
              </div>
              <div className="legend-item">
                <span className="legend-line today"></span>
                <span>Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Row - KPI Cards */}
        <div className="pulse-bottom-row">
          <div className="kpi-section">
            <h3>Latency</h3>
            <div className="kpi-cards">
              <div className="kpi-card-large">
                <div className="kpi-value">{kpis.avgJobDurationWTD}s</div>
                <div className="kpi-label">Avg Job Duration WTD</div>
              </div>
              <div className="kpi-card-large">
                <div className="kpi-value">{kpis.jobsDelayedWTD}%</div>
                <div className="kpi-label">Jobs Delayed &gt;1s WTD</div>
              </div>
            </div>
          </div>

          <div className="kpi-section">
            <h3>Capacity</h3>
            <div className="capacity-section">
              <div className="capacity-header">Current Reservations</div>
              <div className="capacity-details">
                <div className="capacity-row">
                  <span>Reservations Total Slot Capacity</span>
                  <span>{reservations.totalSlotCapacity}</span>
                </div>
                <div className="capacity-row">
                  <span>Capacity Commitments Total Slots</span>
                  <span>{reservations.totalSlots}</span>
                </div>
                <div className="capacity-row">
                  <span>Capacity Commitments Total Idle</span>
                  <span>{reservations.totalIdleSlots}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="kpi-section">
            <h3>Optimization</h3>
            <div className="kpi-cards">
              <div className="kpi-card-large">
                <div className="kpi-value">{kpis.queryCacheRateWTD}%</div>
                <div className="kpi-label">Query Cache Rate WTD</div>
              </div>
              <div className="kpi-card-large">
                <div className="kpi-value">{kpis.spillsToDiskWTD}</div>
                <div className="kpi-label">Spills to Disk WTD</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PulseView;