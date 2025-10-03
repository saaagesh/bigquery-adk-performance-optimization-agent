import React, { useState } from 'react';
import { RefreshCw, Search, X, ChevronDown } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

const FilterControls = ({ 
  onRefresh, 
  loading = false, 
  showTimeRange = false, 
  timeRange, 
  onTimeRangeChange, 
  timeRangeOptions,
  showDaysFilter = false,
  days = 1,
  onDaysChange,
  daysOptions = [
    { value: 1, label: '1 Day' },
    { value: 3, label: '3 Days' },
    { value: 7, label: '7 Days' },
    { value: 14, label: '14 Days' },
    { value: 30, label: '30 Days' }
  ],
  // ETL Interface filter props
  showInterfaceFilter = false,
  availableInterfaceCodes = [],
  selectedInterfaceCodes = [],
  interfaceCodeFilter = '',
  onInterfaceCodeFilterChange,
  onInterfaceCodeToggle,
  onClearAllInterfaceCodes,
  loadingInterfaceCodes = false
}) => {
  const { 
    projects, 
    selectedProject, 
    setSelectedProject, 
    selectedRegion, 
    setSelectedRegion, 
    regions,
    loading: projectsLoading 
  } = useAppContext();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const getFilteredInterfaceCodes = () => {
    if (!interfaceCodeFilter) return availableInterfaceCodes;
    return availableInterfaceCodes.filter(item => 
      item.interface_code.toLowerCase().includes(interfaceCodeFilter.toLowerCase())
    );
  };

  const removeInterfaceCode = (code) => {
    if (onInterfaceCodeToggle) {
      const updatedCodes = selectedInterfaceCodes.filter(c => c !== code);
      // Call with the individual code to remove it
      onInterfaceCodeToggle(code);
    }
  };

  const handleInputClick = () => {
    setIsDropdownOpen(true);
  };

  const handleInputChange = (e) => {
    onInterfaceCodeFilterChange && onInterfaceCodeFilterChange(e.target.value);
    setIsDropdownOpen(true);
  };

  const handleInterfaceCodeSelect = (code) => {
    onInterfaceCodeToggle && onInterfaceCodeToggle(code);
    // Keep dropdown open for multi-select
  };

  const handleClickOutside = (e) => {
    if (!e.target.closest('.interface-filter-group')) {
      setIsDropdownOpen(false);
    }
  };

  // Add click outside listener
  React.useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

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

        {showDaysFilter && (
          <div className="filter-group">
            <label>Days</label>
            <select 
              value={days} 
              onChange={(e) => onDaysChange(parseInt(e.target.value))}
              className="filter-dropdown"
            >
              {daysOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showInterfaceFilter && (
          <div className="filter-group interface-filter-group" style={{ position: 'relative', minWidth: '250px' }}>
            <label>Interface Codes</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#666', zIndex: 1 }} />
              <ChevronDown size={14} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#666', zIndex: 1 }} />
              <input
                type="text"
                placeholder="Search interface codes..."
                value={interfaceCodeFilter}
                onChange={handleInputChange}
                onClick={handleInputClick}
                className="filter-dropdown"
                style={{
                  paddingLeft: '30px',
                  paddingRight: '30px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
              />
              {selectedInterfaceCodes.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  background: 'white',
                  border: '1px solid #ddd',
                  borderTop: 'none',
                  borderRadius: '0 0 4px 4px',
                  padding: '6px',
                  zIndex: 10,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '4px',
                  maxHeight: '60px',
                  overflowY: 'auto'
                }}>
                  {selectedInterfaceCodes.slice(0, 5).map(code => (
                    <div key={code} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '2px',
                      padding: '1px 4px',
                      background: '#007bff',
                      color: 'white',
                      borderRadius: '2px',
                      fontSize: '11px'
                    }}>
                      <span>{code}</span>
                      <X
                        size={10}
                        style={{ cursor: 'pointer' }}
                        onClick={() => removeInterfaceCode(code)}
                      />
                    </div>
                  ))}
                  {selectedInterfaceCodes.length > 5 && (
                    <span style={{ fontSize: '10px', color: '#666', alignSelf: 'center' }}>
                      +{selectedInterfaceCodes.length - 5}
                    </span>
                  )}
                  <button
                    onClick={onClearAllInterfaceCodes}
                    style={{
                      padding: '1px 4px',
                      fontSize: '10px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '2px',
                      cursor: 'pointer'
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
            
            {/* Dropdown for available interface codes - only show when open */}
            {isDropdownOpen && getFilteredInterfaceCodes().length > 0 && (
              <div style={{
                position: 'absolute',
                top: selectedInterfaceCodes.length > 0 ? 'calc(100% + 60px)' : '100%',
                left: 0,
                right: 0,
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #ddd',
                borderRadius: '4px',
                background: 'white',
                zIndex: 20,
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}>
                <div style={{ 
                  padding: '6px 8px', 
                  fontSize: '11px', 
                  fontWeight: '500', 
                  background: '#f8f9fa', 
                  borderBottom: '1px solid #eee',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <span>Available ({getFilteredInterfaceCodes().length})</span>
                  <button
                    onClick={() => setIsDropdownOpen(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#666',
                      cursor: 'pointer',
                      padding: '0',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
                {loadingInterfaceCodes ? (
                  <div style={{ padding: '10px', textAlign: 'center', fontSize: '12px' }}>Loading...</div>
                ) : (
                  getFilteredInterfaceCodes().slice(0, 10).map(item => (
                    <div
                      key={item.interface_code}
                      onClick={() => handleInterfaceCodeSelect(item.interface_code)}
                      style={{
                        padding: '4px 8px',
                        cursor: 'pointer',
                        borderBottom: '1px solid #f0f0f0',
                        background: selectedInterfaceCodes.includes(item.interface_code) ? '#e7f3ff' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedInterfaceCodes.includes(item.interface_code)}
                        readOnly
                        style={{ margin: 0, transform: 'scale(0.8)' }}
                      />
                      <span>{item.interface_code}</span>
                    </div>
                  ))
                )}
                {getFilteredInterfaceCodes().length > 10 && (
                  <div style={{ padding: '4px 8px', fontSize: '11px', color: '#666', fontStyle: 'italic' }}>
                    ... and {getFilteredInterfaceCodes().length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

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