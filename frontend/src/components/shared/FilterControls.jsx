import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

const FilterControls = ({ onRefresh, loading = false, showTimeRange = false, timeRange, onTimeRangeChange, timeRangeOptions }) => {
  const { 
    projects, 
    selectedProject, 
    setSelectedProject, 
    selectedRegion, 
    setSelectedRegion, 
    regions,
    loading: projectsLoading 
  } = useAppContext();

  return (
    <div className="filter-controls">
      <div className="filter-row">
        <div className="filter-group">
          <label>Region</label>
          <select 
            value={selectedRegion} 
            onChange={(e) => setSelectedRegion(e.target.value)}
            className="filter-dropdown"
            disabled={projectsLoading}
          >
            {regions.map(region => (
              <option key={region.value} value={region.value}>
                {region.label}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Project</label>
          <select 
            value={selectedProject} 
            onChange={(e) => setSelectedProject(e.target.value)}
            className="filter-dropdown"
            disabled={projectsLoading}
          >
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {showTimeRange && (
          <div className="filter-group">
            <label>Time Range</label>
            <select 
              value={timeRange} 
              onChange={(e) => onTimeRangeChange(e.target.value)}
              className="filter-dropdown"
            >
              {timeRangeOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button 
          onClick={onRefresh} 
          disabled={loading || projectsLoading} 
          className="refresh-btn"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {projectsLoading && (
        <div className="filter-status">
          Loading projects for {regions.find(r => r.value === selectedRegion)?.label}...
        </div>
      )}
    </div>
  );
};

export default FilterControls;