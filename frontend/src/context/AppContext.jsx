import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import Config from '../config';

const AppContext = createContext();

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState('any_value');
  const [selectedRegion, setSelectedRegion] = useState('us');
  const [loading, setLoading] = useState(false);

  const regions = [
    { value: 'us', label: 'US (Multi-region)' },
    { value: 'eu', label: 'EU (Multi-region)' },
    { value: 'asia', label: 'Asia (Multi-region)' },
    { value: 'us-central1', label: 'US Central 1' },
    { value: 'us-east1', label: 'US East 1' },
    { value: 'us-east4', label: 'US East 4' },
    { value: 'us-west1', label: 'US West 1' },
    { value: 'us-west2', label: 'US West 2' },
    { value: 'us-west3', label: 'US West 3' },
    { value: 'us-west4', label: 'US West 4' },
    { value: 'europe-west1', label: 'Europe West 1' },
    { value: 'europe-west2', label: 'Europe West 2' },
    { value: 'europe-west3', label: 'Europe West 3' },
    { value: 'europe-west4', label: 'Europe West 4' },
    { value: 'europe-west6', label: 'Europe West 6' },
    { value: 'asia-east1', label: 'Asia East 1' },
    { value: 'asia-northeast1', label: 'Asia Northeast 1' },
    { value: 'asia-southeast1', label: 'Asia Southeast 1' },
    { value: 'asia-south1', label: 'Asia South 1' }
  ];

  const fetchProjects = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${Config.API_BASE_URL}/projects?region=${selectedRegion}`);
      setProjects(response.data);
    } catch (error) {
      console.error('Error fetching projects:', error);
      setProjects([
        { id: 'any_value', name: 'is any value', display_name: 'All Projects' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [selectedRegion]);

  const value = {
    projects,
    selectedProject,
    setSelectedProject,
    selectedRegion,
    setSelectedRegion,
    regions,
    loading,
    refreshProjects: fetchProjects
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export default AppContext;