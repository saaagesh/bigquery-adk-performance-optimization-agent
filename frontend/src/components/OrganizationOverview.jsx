import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Database, TrendingUp, AlertCircle, Users } from 'lucide-react';
import axios from 'axios';
import { useAppContext } from '../context/AppContext';
import FilterControls from './shared/FilterControls';
import Config from '../config';

const API_BASE = Config.API_BASE_URL;

const OrganizationOverview = () => {
  const { selectedProject, selectedRegion } = useAppContext();
  const [projects, setProjects] = useState([]);
  const [orgStats, setOrgStats] = useState({
    totalProjects: 0,
    totalQueries: 0,
    totalSlotHours: 0,
    totalUsers: 0,
    totalTBProcessed: 0,
    totalErrors: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganizationData();
  }, [selectedProject, selectedRegion]);

  const fetchOrganizationData = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_BASE}/organization-overview?region=${selectedRegion}`);
      const { projects: projectsData, orgStats: statsData } = response.data;
      
      // Format projects data
      const formattedProjects = projectsData.map(project => ({
        id: project.project_id,
        name: project.project_id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: `BigQuery project: ${project.project_id}`,
        queriesLast24h: project.total_queries,
        slotHoursLast24h: Math.round(project.slot_hours * 100) / 100,
        topUsers: [], // Would need additional query to get top users per project
        status: project.error_count > project.total_queries * 0.05 ? 'warning' : 'healthy',
        tbProcessed: Math.round(project.tb_processed * 100) / 100,
        errorCount: project.error_count
      }));

      setProjects(formattedProjects);
      setOrgStats({
        totalProjects: statsData.totalProjects,
        totalQueries: statsData.totalQueries,
        totalSlotHours: Math.round(statsData.totalSlotHours * 100) / 100,
        totalUsers: statsData.totalUsers,
        totalTBProcessed: Math.round(statsData.totalTBProcessed * 100) / 100,
        totalErrors: statsData.totalErrors
      });
    } catch (error) {
      console.error('Error fetching organization data:', error);
      // Fallback to empty data
      setProjects([]);
      setOrgStats({
        totalProjects: 0,
        totalQueries: 0,
        totalSlotHours: 0,
        totalUsers: 0,
        totalTBProcessed: 0,
        totalErrors: 0
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loader"></div>;
  }

  return (
    <div className="organization-overview">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>Organization Overview</h2>
            <p>Monitor BigQuery usage across all projects</p>
          </div>
        </div>
        <FilterControls 
          onRefresh={fetchOrganizationData}
          loading={loading}
        />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Database />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalProjects}</h3>
            <p>Active Projects</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <TrendingUp />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalQueries.toLocaleString()}</h3>
            <p>Queries (24h)</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <AlertCircle />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalSlotHours.toFixed(1)}</h3>
            <p>Slot Hours (24h)</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Users />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalUsers}</h3>
            <p>Active Users</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Database />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalTBProcessed}</h3>
            <p>TB Processed</p>
          </div>
        </div>

        <div className="stat-card error">
          <div className="stat-icon">
            <AlertCircle />
          </div>
          <div className="stat-content">
            <h3>{orgStats.totalErrors}</h3>
            <p>Total Errors</p>
          </div>
        </div>
      </div>

      <div className="projects-grid">
        <h3>Projects</h3>
        <div className="projects-list">
          {projects.map(project => (
            <Link key={project.id} to={`/project/${project.id}`} className="project-card">
              <div className="project-header">
                <div className="project-info">
                  <h4>{project.name}</h4>
                  <p>{project.description}</p>
                </div>
                <div className={`project-status ${project.status}`}>
                  {project.status}
                </div>
              </div>
              
              <div className="project-metrics">
                <div className="metric">
                  <span className="metric-value">{project.queriesLast24h.toLocaleString()}</span>
                  <span className="metric-label">Queries</span>
                </div>
                <div className="metric">
                  <span className="metric-value">{project.slotHoursLast24h}</span>
                  <span className="metric-label">Slot Hours</span>
                </div>
                <div className="metric">
                  <span className="metric-value">{project.tbProcessed}</span>
                  <span className="metric-label">TB Processed</span>
                </div>
                {project.errorCount > 0 && (
                  <div className="metric error">
                    <span className="metric-value">{project.errorCount}</span>
                    <span className="metric-label">Errors</span>
                  </div>
                )}
              </div>

              <div className="project-users">
                <span className="users-label">Top Users:</span>
                <div className="users-list">
                  {project.topUsers.slice(0, 2).map(user => (
                    <span key={user} className="user-tag">{user}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrganizationOverview;