"""
Configuration module for BigQuery Analytics Hub backend.
All configuration values should be defined here and loaded from environment variables.
"""
import os
from typing import List, Optional

class Config:
    """Configuration class that loads all settings from environment variables."""
    
    # Server Configuration
    PORT: int = int(os.getenv("PORT", "8080"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    FLASK_ENV: str = os.getenv("FLASK_ENV", "development")
    
    # Google Cloud Configuration
    GOOGLE_CLOUD_PROJECT: Optional[str] = os.getenv("GOOGLE_CLOUD_PROJECT")
    GEMINI_API_KEY: Optional[str] = os.getenv("GEMINI_API_KEY")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    
    # BigQuery Configuration
    BIGQUERY_REGION: str = os.getenv("BIGQUERY_REGION", "us")
    BIGQUERY_LOCATION: str = os.getenv("BIGQUERY_LOCATION", "US")
    # Force region-us since that's what works
    BIGQUERY_REGION_FORMAT: str = "region-us"
    DEFAULT_TIME_RANGE_HOURS: int = int(os.getenv("DEFAULT_TIME_RANGE_HOURS", "24"))
    MAX_QUERY_RESULTS: int = int(os.getenv("MAX_QUERY_RESULTS", "20"))
    QUERY_TIMEOUT_SECONDS: int = int(os.getenv("QUERY_TIMEOUT_SECONDS", "300"))
    
    # Performance Configuration
    SLOT_USAGE_MAX: int = int(os.getenv("SLOT_USAGE_MAX", "2000"))
    JOB_CONCURRENCY_MAX: int = int(os.getenv("JOB_CONCURRENCY_MAX", "100"))
    CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))
    
    # Region Options for BigQuery INFORMATION_SCHEMA
    @property
    def BIGQUERY_REGION_OPTIONS(self) -> List[str]:
        """Get list of region formats to try for BigQuery INFORMATION_SCHEMA queries."""
        base_region = self.BIGQUERY_REGION.lower()
        return [
            f"region-{base_region}",
            f"region-{base_region.upper()}",
            base_region,
            base_region.upper()
        ]
    
    # Time Range Mapping
    TIME_RANGE_HOURS_MAP = {
        '1h': 1,
        '24h': 24,
        '7d': 168,
        '30d': 720
    }
    
    @classmethod
    def get_hours_from_range(cls, time_range: str) -> int:
        """Convert time range string to hours."""
        return cls.TIME_RANGE_HOURS_MAP.get(time_range, cls.DEFAULT_TIME_RANGE_HOURS)
    
    @classmethod
    def validate_config(cls) -> List[str]:
        """Validate configuration and return list of missing required values."""
        missing = []
        
        if not cls.GEMINI_API_KEY:
            missing.append("GEMINI_API_KEY")
        
        if not cls.GOOGLE_CLOUD_PROJECT:
            missing.append("GOOGLE_CLOUD_PROJECT")
            
        return missing

# Create global config instance
config = Config()