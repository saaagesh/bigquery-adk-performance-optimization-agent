/**
 * Configuration module for BigQuery Analytics Hub frontend.
 * All configuration values should be defined here and loaded from environment variables.
 */

class Config {
  // API Configuration
  static API_BASE_URL = import.meta.env.VITE_REACT_APP_API_BASE_URL || 'http://localhost:8080/api';
  
  // Default Settings
  static DEFAULT_TIME_RANGE = import.meta.env.VITE_REACT_APP_DEFAULT_TIME_RANGE || '24h';
  static REFRESH_INTERVAL_MS = parseInt(import.meta.env.VITE_REACT_APP_REFRESH_INTERVAL_MS || '30000');
  
  // Time Range Options
  static TIME_RANGE_OPTIONS = [
    { value: '1h', label: 'Last Hour' },
    { value: '24h', label: 'Last 24 Hours' },
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' }
  ];
  
  // Chart Colors
  static CHART_COLORS = {
    primary: '#4285f4',
    secondary: '#34a853',
    warning: '#fbbc04',
    error: '#ea4335',
    info: '#9c27b0',
    success: '#0f9d58'
  };
  
  // Error Colors for Charts
  static ERROR_COLORS = ['#ea4335', '#fbbc04', '#ff6d01', '#9aa0a6', '#34a853'];
  
  // Job Type Colors
  static JOB_TYPE_COLORS = ['#4285f4', '#34a853', '#fbbc04', '#ea4335', '#9c27b0', '#ff6d01'];
  
  // Pagination
  static DEFAULT_PAGE_SIZE = 10;
  static MAX_QUERY_PREVIEW_LENGTH = 150;
  
  // Validation
  static validateConfig() {
    const issues = [];
    
    if (!this.API_BASE_URL) {
      issues.push('API_BASE_URL is not configured');
    }
    
    if (this.REFRESH_INTERVAL_MS < 1000) {
      issues.push('REFRESH_INTERVAL_MS should be at least 1000ms');
    }
    
    return issues;
  }
  
  // Environment Info
  static getEnvironmentInfo() {
    return {
      nodeEnv: import.meta.env.MODE,
      apiBaseUrl: this.API_BASE_URL,
      defaultTimeRange: this.DEFAULT_TIME_RANGE,
      refreshInterval: this.REFRESH_INTERVAL_MS
    };
  }
}

export default Config;