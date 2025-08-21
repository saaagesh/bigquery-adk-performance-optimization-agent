#!/usr/bin/env python3
"""
BigQuery Access Test Script
Run this script to test BigQuery access and identify the correct region/project configuration.
"""

import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from dotenv import load_dotenv
from google.cloud import bigquery

def test_bigquery_access():
    """Test BigQuery access and find working regions."""
    print("🔍 Testing BigQuery Access...")
    print("=" * 60)
    
    # Load environment variables
    load_dotenv()
    
    try:
        client = bigquery.Client()
        print(f"✅ BigQuery client initialized successfully")
        print(f"   Default project: {client.project}")
    except Exception as e:
        print(f"❌ Failed to initialize BigQuery client: {e}")
        return False
    
    # Test different region formats
    regions_to_test = [
        'region-us',
        'us', 
        'region-US',
        'US',
        'region-eu',
        'eu',
        'region-asia',
        'asia'
    ]
    
    working_regions = []
    
    for region in regions_to_test:
        try:
            print(f"\n🌍 Testing region: {region}")
            
            query = f"""
                SELECT 
                    COUNT(*) as job_count,
                    COUNT(DISTINCT project_id) as project_count,
                    MIN(creation_time) as earliest_job,
                    MAX(creation_time) as latest_job
                FROM `{region}.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                    AND job_type = 'QUERY'
            """
            
            query_job = client.query(query, timeout=30)
            results = list(query_job.result())
            
            if results and results[0].job_count > 0:
                result = results[0]
                print(f"   ✅ Found {result.job_count} jobs across {result.project_count} projects")
                print(f"   📅 Date range: {result.earliest_job} to {result.latest_job}")
                working_regions.append({
                    'region': region,
                    'job_count': result.job_count,
                    'project_count': result.project_count,
                    'earliest_job': result.earliest_job,
                    'latest_job': result.latest_job
                })
            else:
                print(f"   ⚠️  No jobs found in region {region}")
                
        except Exception as e:
            print(f"   ❌ Error accessing region {region}: {str(e)[:100]}...")
    
    if not working_regions:
        print(f"\n❌ No working regions found!")
        print("   This could mean:")
        print("   • No recent BigQuery activity")
        print("   • Insufficient permissions")
        print("   • Wrong region configuration")
        return False
    
    print(f"\n🎉 Found {len(working_regions)} working regions:")
    for region_info in working_regions:
        print(f"   • {region_info['region']}: {region_info['job_count']} jobs, {region_info['project_count']} projects")
    
    # Test expensive queries for the best region
    best_region = max(working_regions, key=lambda x: x['job_count'])
    print(f"\n🔥 Testing expensive queries in best region: {best_region['region']}")
    
    try:
        expensive_query = f"""
            SELECT
                job_id,
                project_id,
                user_email,
                total_slot_ms,
                total_bytes_processed / POW(10, 9) as gb_processed,
                LEFT(query, 100) as query_preview
            FROM `{best_region['region']}.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                AND job_type = 'QUERY'
                AND total_slot_ms > 0
                AND query IS NOT NULL
                AND query NOT LIKE '%INFORMATION_SCHEMA%'
            ORDER BY total_slot_ms DESC
            LIMIT 5
        """
        
        query_job = client.query(expensive_query, timeout=30)
        expensive_results = list(query_job.result())
        
        if expensive_results:
            print(f"   ✅ Found {len(expensive_results)} expensive queries:")
            for i, query in enumerate(expensive_results, 1):
                print(f"   {i}. Project: {query.project_id}")
                print(f"      User: {query.user_email}")
                print(f"      Slot ms: {query.total_slot_ms:,}")
                print(f"      GB processed: {query.gb_processed:.2f}")
                print(f"      Preview: {query.query_preview}...")
                print()
        else:
            print(f"   ⚠️  No expensive queries found (all queries might be very fast)")
            
    except Exception as e:
        print(f"   ❌ Error fetching expensive queries: {e}")
    
    # Generate configuration recommendations
    print("\n📝 Configuration Recommendations:")
    print("   Add these to your .env file:")
    print(f"   BIGQUERY_REGION={best_region['region'].replace('region-', '')}")
    print(f"   GOOGLE_CLOUD_PROJECT={client.project}")
    
    if working_regions:
        print(f"\n   Alternative regions you can use:")
        for region_info in working_regions:
            if region_info['region'] != best_region['region']:
                clean_region = region_info['region'].replace('region-', '')
                print(f"   BIGQUERY_REGION={clean_region}  # {region_info['job_count']} jobs")
    
    return True

def test_projects_in_region(region):
    """Test projects in a specific region."""
    print(f"\n📊 Testing projects in region: {region}")
    
    try:
        client = bigquery.Client()
        
        query = f"""
            SELECT 
                project_id,
                COUNT(DISTINCT job_id) as job_count,
                COUNT(DISTINCT user_email) as user_count,
                SUM(total_slot_ms) / 1000 / 3600 as slot_hours,
                MAX(creation_time) as last_activity
            FROM `{region}.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                AND job_type = 'QUERY'
            GROUP BY project_id
            HAVING job_count > 0
            ORDER BY slot_hours DESC
            LIMIT 10
        """
        
        query_job = client.query(query, timeout=30)
        results = list(query_job.result())
        
        if results:
            print(f"   Found {len(results)} active projects:")
            for project in results:
                print(f"   • {project.project_id}")
                print(f"     Jobs: {project.job_count}, Users: {project.user_count}")
                print(f"     Slot hours: {project.slot_hours:.2f}, Last activity: {project.last_activity}")
                print()
        else:
            print(f"   No active projects found in region {region}")
            
    except Exception as e:
        print(f"   Error: {e}")

def main():
    """Main function."""
    print("🚀 BigQuery Analytics Hub - Access Test")
    print("This script will help you identify the correct BigQuery configuration.")
    print()
    
    success = test_bigquery_access()
    
    if success:
        print("\n💡 Next Steps:")
        print("1. Update your .env file with the recommended configuration")
        print("2. Restart your backend server")
        print("3. Try the dashboard again")
        print("4. If you still have issues, run the manual queries from MANUAL_QUERIES.md")
    else:
        print("\n🔧 Troubleshooting:")
        print("1. Check your Google Cloud credentials")
        print("2. Ensure you have BigQuery Job User role")
        print("3. Verify you have recent BigQuery activity")
        print("4. Try running queries manually in BigQuery console")
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())