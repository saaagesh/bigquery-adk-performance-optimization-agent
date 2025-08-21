#!/usr/bin/env python3
"""
Configuration validation script for BigQuery Analytics Hub.
Run this script to validate that all required configuration is properly set.
"""

import os
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from dotenv import load_dotenv
from config import config

def validate_backend_config():
    """Validate backend configuration."""
    print("🔧 Validating Backend Configuration...")
    
    # Load environment variables
    load_dotenv()
    
    issues = []
    warnings = []
    
    # Check required configuration
    missing_required = config.validate_config()
    if missing_required:
        issues.extend([f"Missing required config: {item}" for item in missing_required])
    
    # Check optional but recommended configuration
    if config.PORT == 8080:
        warnings.append("Using default PORT (8080) - consider setting PORT environment variable")
    
    if config.BIGQUERY_REGION == "us":
        warnings.append("Using default BIGQUERY_REGION (us) - consider setting for your specific region")
    
    if config.MAX_QUERY_RESULTS == 20:
        warnings.append("Using default MAX_QUERY_RESULTS (20)")
    
    # Check file permissions and paths
    env_file = Path(".env")
    if not env_file.exists():
        warnings.append(".env file not found - using environment variables or defaults")
    
    # Print results
    if issues:
        print("❌ Configuration Issues Found:")
        for issue in issues:
            print(f"   • {issue}")
    else:
        print("✅ All required backend configuration is valid")
    
    if warnings:
        print("⚠️  Configuration Warnings:")
        for warning in warnings:
            print(f"   • {warning}")
    
    print(f"\n📊 Current Backend Configuration:")
    print(f"   • Port: {config.PORT}")
    print(f"   • Host: {config.HOST}")
    print(f"   • Debug: {config.DEBUG}")
    print(f"   • BigQuery Region: {config.BIGQUERY_REGION}")
    print(f"   • Max Query Results: {config.MAX_QUERY_RESULTS}")
    print(f"   • Gemini Model: {config.GEMINI_MODEL}")
    
    return len(issues) == 0

def validate_frontend_config():
    """Validate frontend configuration."""
    print("\n🎨 Validating Frontend Configuration...")
    
    # Check for frontend config file
    frontend_config = Path(__file__).parent.parent / "frontend" / "src" / "config.js"
    if not frontend_config.exists():
        print("❌ Frontend config.js file not found")
        return False
    
    # Check environment variables that would be used in build
    frontend_issues = []
    frontend_warnings = []
    
    api_base_url = os.getenv("REACT_APP_API_BASE_URL")
    if not api_base_url:
        frontend_warnings.append("REACT_APP_API_BASE_URL not set - using default localhost:8080")
    
    refresh_interval = os.getenv("REACT_APP_REFRESH_INTERVAL_MS")
    if refresh_interval and int(refresh_interval) < 1000:
        frontend_issues.append("REACT_APP_REFRESH_INTERVAL_MS should be at least 1000ms")
    
    # Print results
    if frontend_issues:
        print("❌ Frontend Configuration Issues Found:")
        for issue in frontend_issues:
            print(f"   • {issue}")
    else:
        print("✅ Frontend configuration is valid")
    
    if frontend_warnings:
        print("⚠️  Frontend Configuration Warnings:")
        for warning in frontend_warnings:
            print(f"   • {warning}")
    
    print(f"\n🎨 Current Frontend Configuration:")
    print(f"   • API Base URL: {api_base_url or 'http://localhost:8080/api (default)'}")
    print(f"   • Refresh Interval: {refresh_interval or '30000 (default)'} ms")
    
    return len(frontend_issues) == 0

def check_hardcoded_values():
    """Check for remaining hardcoded values."""
    print("\n🔍 Checking for Hardcoded Values...")
    
    hardcoded_found = []
    
    # Check backend files
    backend_files = [
        "backend/app.py",
        "backend/config.py"
    ]
    
    for file_path in backend_files:
        if Path(file_path).exists():
            with open(file_path, 'r') as f:
                content = f.read()
                if 'localhost:8080' in content:
                    hardcoded_found.append(f"{file_path}: contains 'localhost:8080'")
                if 'region-us' in content and 'region_options' not in content:
                    hardcoded_found.append(f"{file_path}: contains hardcoded 'region-us'")
    
    # Check frontend files
    frontend_files = [
        "frontend/src/components/OrganizationOverview.jsx",
        "frontend/src/components/PulseView.jsx",
        "frontend/src/components/ExpensiveQueries.jsx",
        "frontend/src/components/TimeWindowInvestigation.jsx"
    ]
    
    for file_path in frontend_files:
        if Path(file_path).exists():
            with open(file_path, 'r') as f:
                content = f.read()
                if 'localhost:8080' in content and 'Config.API_BASE_URL' not in content:
                    hardcoded_found.append(f"{file_path}: contains hardcoded 'localhost:8080'")
    
    if hardcoded_found:
        print("❌ Hardcoded Values Found:")
        for item in hardcoded_found:
            print(f"   • {item}")
        return False
    else:
        print("✅ No hardcoded values found")
        return True

def main():
    """Main validation function."""
    print("🚀 BigQuery Analytics Hub - Configuration Validation")
    print("=" * 60)
    
    backend_valid = validate_backend_config()
    frontend_valid = validate_frontend_config()
    no_hardcoded = check_hardcoded_values()
    
    print("\n" + "=" * 60)
    
    if backend_valid and frontend_valid and no_hardcoded:
        print("🎉 All configuration validation passed!")
        print("\n💡 Next steps:")
        print("   1. Copy .env.example to .env and fill in your values")
        print("   2. Set REACT_APP_* environment variables for frontend build")
        print("   3. Run the application with: python backend/app.py")
        return 0
    else:
        print("❌ Configuration validation failed!")
        print("   Please fix the issues above before running the application.")
        return 1

if __name__ == "__main__":
    sys.exit(main())