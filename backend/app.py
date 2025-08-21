import os
import uuid
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from google.cloud import bigquery
from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
import google.generativeai as genai
from google.ai import generativelanguage as glm
from config import config

# Load environment variables from .env file
load_dotenv()

# Validate configuration
missing_config = config.validate_config()
if missing_config:
    print(f"Warning: Missing required configuration: {', '.join(missing_config)}")

# Initialize Flask app and CORS
app = Flask(__name__)
CORS(app)

# Configure the generative AI model
if config.GEMINI_API_KEY:
    genai.configure(api_key=config.GEMINI_API_KEY)

# Initialize BigQuery Client
try:
    bq_client = bigquery.Client(project=config.GOOGLE_CLOUD_PROJECT)
    project_id = bq_client.project
except Exception as e:
    print(f"Error initializing BigQuery client: {e}")
    bq_client = None
    project_id = config.GOOGLE_CLOUD_PROJECT

# Define the BigQuery Optimizer Agent
optimizer_agent = LlmAgent(
    name="optimizer_agent",
    description="BigQuery Optimization Expert",
    model=config.GEMINI_MODEL,
    instruction="You are a Google Cloud BigQuery optimization expert.",
)

# Create a runner for the agent
runner = InMemoryRunner(agent=optimizer_agent)

@app.route('/api/expensive-queries', methods=['GET'])
def get_expensive_queries():
    """
    Fetches expensive BigQuery queries using the exact working query structure.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized", "debug": "BigQuery client not available"}), 500

    project_filter = request.args.get('project', 'any_value')
    region_filter = request.args.get('region', 'us')
    
    # Build project filter clause
    project_where_clause = ""
    if project_filter != 'any_value':
        project_where_clause = f"AND project_id = '{project_filter}'"

    debug_messages = []
    
    # Use the exact working query structure
    try:
        debug_messages.append("Using exact working query with region-us")
        
        query = f"""
            SELECT
                job_id,
                project_id,
                user_email,
                creation_time,
                total_slot_ms,
                total_bytes_processed / POW(10, 9) as gb_processed,
                TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
                state,
                error_result.reason as error_reason,
                LEFT(query, 200) as query_preview,
                query
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                AND job_type = 'QUERY'
                AND total_slot_ms > 0
                AND query IS NOT NULL
                AND query NOT LIKE '%INFORMATION_SCHEMA%'
                {project_where_clause}
            ORDER BY total_slot_ms DESC
            LIMIT {config.MAX_QUERY_RESULTS};
        """
        
        debug_messages.append("Executing working query")
        query_job = bq_client.query(query, timeout=config.QUERY_TIMEOUT_SECONDS)
        results = [dict(row) for row in query_job.result()]
        
        debug_messages.append(f"Found {len(results)} results")
        
        return jsonify({
            "queries": results,
            "debug": f"Successfully found {len(results)} queries using region-us",
            "region_used": "region-us"
        })
        
    except Exception as e:
        debug_messages.append(f"Error with working query: {str(e)}")
        
        return jsonify({
            "error": str(e), 
            "message": "Unable to fetch queries from INFORMATION_SCHEMA. Check permissions and region configuration.",
            "debug": "; ".join(debug_messages),
            "queries": []
        }), 500

@app.route('/api/query-details', methods=['POST'])
def get_query_details():
    """
    Fetches the DDL for tables referenced in a specific BigQuery job.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    data = request.get_json()
    job_id = data.get('job_id')
    location = data.get('location', 'US')

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    try:
        job = bq_client.get_job(job_id, location=location or config.BIGQUERY_LOCATION)
        referenced_tables = job.referenced_tables

        ddl_statements = []
        if referenced_tables:
            for table_ref in referenced_tables:
                try:
                    table_id = f"{table_ref.project}.{table_ref.dataset_id}.{table_ref.table_id}"
                    table = bq_client.get_table(table_id)
                    
                    if table.view_query:
                        ddl = f"CREATE OR REPLACE VIEW `{table_id}` AS\n{table.view_query}"
                    else:
                        schema_sql = []
                        for field in table.schema:
                            schema_sql.append(f"  `{field.name}` {field.field_type}")
                        ddl = f"CREATE TABLE `{table_id}` (\n" + ",\n".join(schema_sql) + "\n)"
                    
                    ddl_statements.append(ddl)
                except Exception as e:
                    ddl_statements.append(f"/* ERROR fetching DDL for {table_id}: {e} */")

        return jsonify({
            "query": job.query,
            "ddl": "\n\n---\n\n".join(ddl_statements)
        })

    except Exception as e:
        print(f"Error fetching query details for job {job_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/optimize', methods=['POST'])
async def optimize_query():
    """
    Uses the ADK agent to get optimization recommendations for a query.
    """
    data = request.get_json()
    query = data.get('query')
    ddl = data.get('ddl')

    if not query or not ddl:
        return jsonify({"error": "Both 'query' and 'ddl' are required"}), 400

    print(f"Received query for optimization: {query}")
    print(f"Received DDL for optimization: {ddl}")

    try:
        prompt = f"""
Analyze the user's query and the provided table/view DDLs.

Based on your analysis, provide the following in markdown format:
1.  **Optimization Suggestions:** A list of specific, actionable recommendations to improve performance and reduce cost. Explain the reasoning behind each suggestion. If the query is already optimal, state that and explain why.
2.  **Rewritten Query:** The rewritten, optimized SQL query. If no changes are needed, return the original query.

---
**QUERY:**
```sql
{query}
```

**DDL:**
```sql
{ddl}
```
---
"""
        
        # Correctly invoke the agent via the runner
        final_event = None
        user_id = str(uuid.uuid4())
        session = await runner.session_service.create_session(
            app_name=runner.app_name, user_id=user_id
        )
        session_id = session.id

        try:
            print("--- AGENT INVOCATION ---")
            final_event = None
            async for event in runner.run_async(
                user_id=user_id,
                session_id=session_id,
                new_message=glm.Content(parts=[glm.Part(text=prompt)])
            ):
                print(f"EVENT AUTHOR: {event.author}")
                if event.content and event.content.parts:
                    # Log the first 200 characters of the content
                    print(f"EVENT CONTENT: {event.content.parts[0].text[:200]}...")
                final_event = event
            print("--- AGENT INVOCATION END ---")
        finally:
            await runner.session_service.delete_session(
                app_name=runner.app_name, user_id=user_id, session_id=session_id
            )
        
        # Extract the text from the final event's response
        recommendations = ""
        if final_event and final_event.content and final_event.content.parts:
             recommendations = final_event.content.parts[0].text

        return jsonify({"recommendations": recommendations})
    except Exception as e:
        print(f"Error getting optimization from agent: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/api/organization-overview', methods=['GET'])
def get_organization_overview():
    """
    Fetches organization-level BigQuery usage overview.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    try:
        # Get projects with recent activity - try different region formats
        region_options = ['region-us', 'region-US', 'US', 'us']
        projects = []
        
        for region in region_options:
            try:
                projects_query = f"""
                    SELECT 
                        project_id,
                        COUNT(DISTINCT job_id) as total_queries,
                        SUM(total_slot_ms) / 1000 / 3600 as slot_hours,
                        COUNT(DISTINCT user_email) as active_users,
                        SUM(total_bytes_processed) / POW(10, 12) as tb_processed,
                        COUNTIF(error_result IS NOT NULL) as error_count
                    FROM `{region}.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                    WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
                        AND job_type = 'QUERY'
                    GROUP BY project_id
                    HAVING total_queries > 0
                    ORDER BY slot_hours DESC
                """
                
                query_job = bq_client.query(projects_query)
                projects = [dict(row) for row in query_job.result()]
                if projects:
                    break
                    
            except Exception as e:
                print(f"Error with region {region} in organization overview: {e}")
                continue
        
        # If no region worked, try without region specification
        if not projects:
            try:
                projects_query = f"""
                    SELECT 
                        project_id,
                        COUNT(DISTINCT job_id) as total_queries,
                        SUM(total_slot_ms) / 1000 / 3600 as slot_hours,
                        COUNT(DISTINCT user_email) as active_users,
                        SUM(total_bytes_processed) / POW(10, 12) as tb_processed,
                        COUNTIF(error_result IS NOT NULL) as error_count
                    FROM INFORMATION_SCHEMA.JOBS_BY_PROJECT
                    WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
                        AND job_type = 'QUERY'
                    GROUP BY project_id
                    HAVING total_queries > 0
                    ORDER BY slot_hours DESC
                """
                
                query_job = bq_client.query(projects_query)
                projects = [dict(row) for row in query_job.result()]
                
            except Exception as e:
                print(f"Error in organization overview (final attempt): {e}")
                projects = []
        
        query_job = bq_client.query(projects_query)
        projects = [dict(row) for row in query_job.result()]
        
        # Calculate organization totals
        org_stats = {
            'totalProjects': len(projects),
            'totalQueries': sum(p['total_queries'] for p in projects),
            'totalSlotHours': sum(p['slot_hours'] or 0 for p in projects),
            'totalUsers': len(set(p['active_users'] for p in projects)),
            'totalTBProcessed': sum(p['tb_processed'] or 0 for p in projects),
            'totalErrors': sum(p['error_count'] or 0 for p in projects)
        }
        
        return jsonify({
            'projects': projects,
            'orgStats': org_stats
        })
        
    except Exception as e:
        print(f"Error fetching organization overview: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/operational-dashboard', methods=['GET'])
def get_operational_dashboard():
    """
    Fetches comprehensive operational metrics for BigQuery dashboard.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    time_range = request.args.get('timeRange', '24h')
    project_filter = request.args.get('project', 'any_value')
    region_filter = request.args.get('region', config.BIGQUERY_REGION)
    hours = config.get_hours_from_range(time_range)
    
    # Build project filter clause
    project_where_clause = ""
    if project_filter != 'any_value':
        project_where_clause = f"AND project_id = '{project_filter}'"
    
    # Build region options
    if region_filter:
        region_options = [
            f"region-{region_filter}",
            f"{region_filter}",
            f"region-{region_filter.upper()}",
            f"{region_filter.upper()}"
        ]
    else:
        region_options = config.BIGQUERY_REGION_OPTIONS
    
    try:
        # Slot usage over time
        slot_usage_query = f"""
            WITH hourly_slots AS (
                SELECT 
                    EXTRACT(HOUR FROM creation_time) as hour,
                    SUM(total_slot_ms) / 1000 as total_slots,
                    COUNT(*) as job_count
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                    AND job_type = 'QUERY'
                    AND total_slot_ms > 0
                GROUP BY hour
                ORDER BY hour
            )
            SELECT 
                CONCAT(LPAD(CAST(hour AS STRING), 2, '0'), ':00') as time,
                COALESCE(total_slots, 0) as slots,
                COALESCE(job_count, 0) as jobs
            FROM hourly_slots
        """
        
        # Job duration distribution
        duration_query = f"""
            WITH job_durations AS (
                SELECT 
                    CASE 
                        WHEN total_slot_ms / 1000 <= 60 THEN '0-1min'
                        WHEN total_slot_ms / 1000 <= 300 THEN '1-5min'
                        WHEN total_slot_ms / 1000 <= 900 THEN '5-15min'
                        WHEN total_slot_ms / 1000 <= 3600 THEN '15-60min'
                        ELSE '60min+'
                    END as duration_bucket
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                    AND job_type = 'QUERY'
                    AND total_slot_ms > 0
            )
            SELECT duration_bucket, COUNT(*) as count
            FROM job_durations
            GROUP BY duration_bucket
            ORDER BY 
                CASE duration_bucket
                    WHEN '0-1min' THEN 1
                    WHEN '1-5min' THEN 2
                    WHEN '5-15min' THEN 3
                    WHEN '15-60min' THEN 4
                    WHEN '60min+' THEN 5
                END
        """
        
        # Bytes processed over time
        bytes_query = f"""
            SELECT 
                EXTRACT(HOUR FROM creation_time) as hour,
                SUM(total_bytes_processed) / POW(10, 12) as tb_processed
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
                AND total_bytes_processed > 0
            GROUP BY hour
            ORDER BY hour
        """
        
        # Error breakdown
        error_query = f"""
            SELECT 
                COALESCE(error_result.reason, 'Unknown') as error_type,
                COUNT(*) as count
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
                AND error_result IS NOT NULL
            GROUP BY error_type
            ORDER BY count DESC
            LIMIT 10
        """
        
        # Top users
        users_query = f"""
            SELECT 
                user_email,
                COUNT(*) as query_count,
                SUM(total_slot_ms) / 1000 / 3600 as slot_hours,
                SUM(total_bytes_processed) / POW(10, 9) as gb_processed
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
                AND user_email IS NOT NULL
            GROUP BY user_email
            ORDER BY slot_hours DESC
            LIMIT 10
        """
        
        # KPIs query
        kpis_query = f"""
            SELECT 
                COUNT(*) as total_jobs,
                COUNT(DISTINCT user_email) as active_users,
                SUM(total_slot_ms) / 1000 as total_slot_seconds,
                SUM(total_bytes_processed) / POW(10, 12) as total_tb_processed,
                AVG(total_slot_ms) / 1000 as avg_duration_seconds,
                COUNTIF(error_result IS NOT NULL) as error_count,
                SUM(total_bytes_billed) / POW(10, 12) as total_tb_billed
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
        """
        
        # Execute all queries
        slot_usage_job = bq_client.query(slot_usage_query)
        duration_job = bq_client.query(duration_query)
        bytes_job = bq_client.query(bytes_query)
        error_job = bq_client.query(error_query)
        users_job = bq_client.query(users_query)
        kpis_job = bq_client.query(kpis_query)
        
        # Process results
        slot_usage_data = [dict(row) for row in slot_usage_job.result()]
        duration_data = [dict(row) for row in duration_job.result()]
        bytes_data = [dict(row) for row in bytes_job.result()]
        error_data = [dict(row) for row in error_job.result()]
        users_data = [dict(row) for row in users_job.result()]
        kpis_data = list(kpis_job.result())[0] if kpis_job.result().total_rows > 0 else {}
        
        # Format bytes data with time labels
        bytes_formatted = []
        for row in bytes_data:
            bytes_formatted.append({
                'time': f"{row['hour']:02d}:00",
                'bytes': float(row['tb_processed'] or 0)
            })
        
        # Format error data for pie chart
        error_colors = ['#ea4335', '#fbbc04', '#ff6d01', '#9aa0a6', '#34a853']
        error_formatted = []
        for i, row in enumerate(error_data):
            error_formatted.append({
                'name': row['error_type'],
                'value': int(row['count']),
                'color': error_colors[i % len(error_colors)]
            })
        
        # Calculate KPIs
        total_jobs = int(kpis_data.get('total_jobs', 0))
        error_count = int(kpis_data.get('error_count', 0))
        error_rate = (error_count / total_jobs * 100) if total_jobs > 0 else 0
        
        dashboard_data = {
            'kpis': {
                'slotUsage': {
                    'current': int(sum(row['slots'] for row in slot_usage_data) / len(slot_usage_data)) if slot_usage_data else 0,
                    'max': config.SLOT_USAGE_MAX,
                    'unit': 'slots'
                },
                'jobConcurrency': {
                    'current': int(sum(row['jobs'] for row in slot_usage_data) / len(slot_usage_data)) if slot_usage_data else 0,
                    'max': config.JOB_CONCURRENCY_MAX,
                    'unit': 'jobs'
                },
                'errors': {
                    'count': error_count,
                    'percentage': round(error_rate, 1)
                },
                'avgJobDuration': {
                    'value': round(float(kpis_data.get('avg_duration_seconds', 0)) / 60, 1),
                    'unit': 'minutes'
                },
                'bytesProcessed': {
                    'value': round(float(kpis_data.get('total_tb_processed', 0)), 2),
                    'unit': 'TB'
                },
                'totalJobs': {
                    'value': total_jobs,
                    'unit': 'jobs'
                },
                'activeUsers': {
                    'value': int(kpis_data.get('active_users', 0)),
                    'unit': 'users'
                }
            },
            'slotUsageChart': slot_usage_data,
            'jobDurationChart': duration_data,
            'bytesProcessedChart': bytes_formatted,
            'errorBreakdown': error_formatted,
            'topUsers': users_data,
            'timeRange': time_range
        }
        
        return jsonify(dashboard_data)
        
    except Exception as e:
        print(f"Error fetching operational dashboard: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/project/<project_id>', methods=['GET'])
def get_project_details(project_id):
    """
    Fetches detailed information for a specific BigQuery project.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    try:
        # Project usage over time
        usage_query = f"""
            SELECT 
                EXTRACT(HOUR FROM creation_time) as hour,
                COUNT(*) as queries,
                SUM(total_slot_ms) / 1000 / 3600 as slot_hours
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
                AND job_type = 'QUERY'
                AND project_id = '{project_id}'
            GROUP BY hour
            ORDER BY hour
        """
        
        # Recent queries
        queries_query = f"""
            SELECT 
                job_id,
                query,
                user_email,
                total_slot_ms,
                creation_time,
                TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
                AND job_type = 'QUERY'
                AND project_id = '{project_id}'
            ORDER BY creation_time DESC
            LIMIT 10
        """
        
        # Datasets info (this requires different approach as INFORMATION_SCHEMA doesn't have dataset sizes)
        datasets = []
        try:
            for dataset in bq_client.list_datasets(project_id):
                dataset_ref = bq_client.dataset(dataset.dataset_id, project=project_id)
                tables = list(bq_client.list_tables(dataset_ref))
                datasets.append({
                    'name': dataset.dataset_id,
                    'tables': len(tables),
                    'sizeGB': 0  # Would need to sum table sizes, which requires additional queries
                })
        except Exception as e:
            print(f"Error fetching datasets for {project_id}: {e}")
        
        usage_job = bq_client.query(usage_query)
        queries_job = bq_client.query(queries_query)
        
        usage_data = [dict(row) for row in usage_job.result()]
        queries_data = [dict(row) for row in queries_job.result()]
        
        # Format usage data
        usage_formatted = []
        for row in usage_data:
            usage_formatted.append({
                'time': f"{row['hour']:02d}:00",
                'queries': int(row['queries']),
                'slotHours': round(float(row['slot_hours'] or 0), 2)
            })
        
        # Format queries data
        queries_formatted = []
        for row in queries_data:
            queries_formatted.append({
                'id': row['job_id'],
                'query': row['query'][:200] + '...' if len(row['query']) > 200 else row['query'],
                'user': row['user_email'],
                'duration': f"{row['duration_seconds']}s" if row['duration_seconds'] else 'N/A',
                'slotMs': int(row['total_slot_ms'] or 0)
            })
        
        project_data = {
            'id': project_id,
            'name': project_id.replace('-', ' ').title(),
            'description': f'BigQuery project: {project_id}',
            'datasets': datasets,
            'recentQueries': queries_formatted,
            'usageChart': usage_formatted
        }
        
        return jsonify(project_data)
        
    except Exception as e:
        print(f"Error fetching project details for {project_id}: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/pulse-data', methods=['GET'])
def get_pulse_data():
    """
    Fetches pulse dashboard data similar to BigQuery's Pulse view.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    project_filter = request.args.get('project', 'any_value')
    
    # Build project filter clause
    project_where_clause = ""
    if project_filter != 'any_value':
        project_where_clause = f"AND project_id = '{project_filter}'"
    
    try:
        # Weekly bytes processed trend
        weekly_bytes_query = f"""
            WITH weekly_data AS (
                SELECT 
                    EXTRACT(WEEK FROM creation_time) as week_num,
                    FORMAT_DATE('%b', DATE_TRUNC(DATE(creation_time), WEEK)) as week_label,
                    SUM(total_bytes_processed) / POW(10, 12) as tb_processed
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 WEEK)
                    AND job_type = 'QUERY'
                    AND total_bytes_processed > 0
                    {project_where_clause}
                GROUP BY week_num, week_label
                ORDER BY week_num DESC
                LIMIT 5
            )
            SELECT week_label as week, tb_processed as value
            FROM weekly_data
            ORDER BY week_num ASC
        """
        
        # Weekly slot ms trend
        weekly_slots_query = f"""
            WITH weekly_data AS (
                SELECT 
                    EXTRACT(WEEK FROM creation_time) as week_num,
                    FORMAT_DATE('%b', DATE_TRUNC(DATE(creation_time), WEEK)) as week_label,
                    SUM(total_slot_ms) / 1000000 as slot_ms_millions
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 5 WEEK)
                    AND job_type = 'QUERY'
                    AND total_slot_ms > 0
                    {project_where_clause}
                GROUP BY week_num, week_label
                ORDER BY week_num DESC
                LIMIT 5
            )
            SELECT week_label as week, slot_ms_millions as value
            FROM weekly_data
            ORDER BY week_num ASC
        """
        
        # Daily bytes processed for current week
        daily_bytes_query = f"""
            SELECT 
                FORMAT_DATE('%b %d', DATE(creation_time)) as date,
                SUM(total_bytes_processed) / POW(10, 9) as gb_processed
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                AND job_type = 'QUERY'
                AND total_bytes_processed > 0
                {project_where_clause}
            GROUP BY DATE(creation_time)
            ORDER BY DATE(creation_time)
        """
        
        # Daily slot rate for current week
        daily_slots_query = f"""
            SELECT 
                FORMAT_DATE('%b %d', DATE(creation_time)) as date,
                AVG(total_slot_ms) / 1000 as avg_slot_rate
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                AND job_type = 'QUERY'
                AND total_slot_ms > 0
                {project_where_clause}
            GROUP BY DATE(creation_time)
            ORDER BY DATE(creation_time)
        """
        
        # KPIs for current week
        kpis_query = f"""
            WITH current_week AS (
                SELECT 
                    SUM(total_bytes_processed) / POW(10, 12) as bytes_processed_wtd,
                    SUM(total_slot_ms) / 1000000 as slot_ms_wtd,
                    AVG(TIMESTAMP_DIFF(end_time, start_time, SECOND)) as avg_duration_wtd,
                    COUNT(*) as total_jobs,
                    COUNTIF(TIMESTAMP_DIFF(start_time, creation_time, SECOND) > 1) as delayed_jobs
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                    AND job_type = 'QUERY'
                    {project_where_clause}
            ),
            previous_week AS (
                SELECT 
                    SUM(total_bytes_processed) / POW(10, 12) as bytes_processed_prev,
                    SUM(total_slot_ms) / 1000000 as slot_ms_prev
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
                    AND creation_time < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
                    AND job_type = 'QUERY'
                    {project_where_clause}
            )
            SELECT 
                cw.bytes_processed_wtd,
                cw.slot_ms_wtd,
                cw.avg_duration_wtd,
                cw.total_jobs,
                cw.delayed_jobs,
                CASE 
                    WHEN pw.bytes_processed_prev > 0 
                    THEN ((cw.bytes_processed_wtd - pw.bytes_processed_prev) / pw.bytes_processed_prev) * 100
                    ELSE 0 
                END as bytes_change_pct,
                CASE 
                    WHEN pw.slot_ms_prev > 0 
                    THEN ((cw.slot_ms_wtd - pw.slot_ms_prev) / pw.slot_ms_prev) * 100
                    ELSE 0 
                END as slot_ms_change_pct
            FROM current_week cw
            CROSS JOIN previous_week pw
        """
        
        # Execute queries
        weekly_bytes_job = bq_client.query(weekly_bytes_query)
        weekly_slots_job = bq_client.query(weekly_slots_query)
        daily_bytes_job = bq_client.query(daily_bytes_query)
        daily_slots_job = bq_client.query(daily_slots_query)
        kpis_job = bq_client.query(kpis_query)
        
        # Process results
        weekly_bytes_data = [dict(row) for row in weekly_bytes_job.result()]
        weekly_slots_data = [dict(row) for row in weekly_slots_job.result()]
        daily_bytes_data = [dict(row) for row in daily_bytes_job.result()]
        daily_slots_data = [dict(row) for row in daily_slots_job.result()]
        kpis_data = list(kpis_job.result())[0] if kpis_job.result().total_rows > 0 else {}
        
        # Format data
        pulse_data = {
            'weeklyBytesProcessed': weekly_bytes_data,
            'weeklySlotMs': weekly_slots_data,
            'bytesProcessedHourly': [{'date': row['date'], 'value': float(row['gb_processed'] or 0)} for row in daily_bytes_data],
            'slotRateHourly': [{'date': row['date'], 'value': float(row['avg_slot_rate'] or 0)} for row in daily_slots_data],
            'kpis': {
                'bytesProcessedWTD': round(float(kpis_data.get('bytes_processed_wtd', 0)), 2),
                'bytesProcessedChange': round(float(kpis_data.get('bytes_change_pct', 0)), 1),
                'slotMsWTD': round(float(kpis_data.get('slot_ms_wtd', 0)), 1),
                'slotMsChange': round(float(kpis_data.get('slot_ms_change_pct', 0)), 1),
                'avgJobDurationWTD': round(float(kpis_data.get('avg_duration_wtd', 0)), 1),
                'jobsDelayedWTD': round((float(kpis_data.get('delayed_jobs', 0)) / max(float(kpis_data.get('total_jobs', 1)), 1)) * 100, 1),
                'queryCacheRateWTD': 66.9,  # This would require cache hit analysis
                'spillsToDiskWTD': 0  # This would require spill analysis
            },
            'reservations': {
                'totalSlotCapacity': 960,  # This would come from reservations API
                'totalSlots': 1000,
                'totalIdleSlots': 1000
            }
        }
        
        return jsonify(pulse_data)
        
    except Exception as e:
        print(f"Error fetching pulse data: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/projects', methods=['GET'])
def get_projects():
    """
    Fetches list of available BigQuery projects with recent activity.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    try:
        # Get projects with recent activity - try different region formats
        region_options = ['region-us', 'region-US', 'US', 'us']
        projects = []
        
        for region in region_options:
            try:
                projects_query = f"""
                    SELECT 
                        project_id,
                        COUNT(DISTINCT job_id) as job_count,
                        MAX(creation_time) as last_activity
                    FROM `{region}.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                    WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                        AND job_type = 'QUERY'
                    GROUP BY project_id
                    HAVING job_count > 0
                    ORDER BY last_activity DESC
                """
                
                query_job = bq_client.query(projects_query)
                projects = [dict(row) for row in query_job.result()]
                if projects:
                    break
                    
            except Exception as e:
                print(f"Error with region {region} in projects endpoint: {e}")
                continue
        
        # If no region worked, try without region specification
        if not projects:
            try:
                projects_query = f"""
                    SELECT 
                        project_id,
                        COUNT(DISTINCT job_id) as job_count,
                        MAX(creation_time) as last_activity
                    FROM INFORMATION_SCHEMA.JOBS_BY_PROJECT
                    WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                        AND job_type = 'QUERY'
                    GROUP BY project_id
                    HAVING job_count > 0
                    ORDER BY last_activity DESC
                """
                
                query_job = bq_client.query(projects_query)
                projects = [dict(row) for row in query_job.result()]
                
            except Exception as e:
                print(f"Error in projects endpoint (final attempt): {e}")
                projects = []
        
        # Format projects for dropdown
        project_list = [
            {
                'id': 'any_value',
                'name': 'is any value',
                'display_name': 'All Projects'
            }
        ]
        
        for project in projects:
            project_list.append({
                'id': project['project_id'],
                'name': project['project_id'],
                'display_name': project['project_id']
            })
        
        return jsonify(project_list)
        
    except Exception as e:
        print(f"Error fetching projects: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/time-window-investigation', methods=['GET'])
def get_time_window_investigation():
    """
    Fetches time window investigation data similar to BigQuery's Time Window Investigation view.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    date_filter = request.args.get('filter', 'is in the last 1 complete day')
    
    # Convert filter to hours
    if 'last 1 complete day' in date_filter:
        hours = 24
    elif 'last 7 complete days' in date_filter:
        hours = 168
    elif 'last 30 complete days' in date_filter:
        hours = 720
    else:
        hours = 24
    
    try:
        # Jobs created by hour
        jobs_by_hour_query = f"""
            SELECT 
                EXTRACT(HOUR FROM creation_time) as hour,
                COUNT(*) as jobs
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
            GROUP BY hour
            ORDER BY hour
        """
        
        # Job types analysis (using query patterns as proxy for join types)
        job_types_query = f"""
            WITH job_analysis AS (
                SELECT 
                    CASE 
                        WHEN UPPER(query) LIKE '%CROSS JOIN%' THEN 'CROSS EACH'
                        WHEN UPPER(query) LIKE '%WITH%' THEN 'WITH EACH'
                        WHEN UPPER(query) LIKE '%FULL OUTER%' THEN 'FULL OUTER'
                        WHEN UPPER(query) LIKE '%HASH JOIN%' THEN 'HASH JOIN EACH'
                        WHEN UPPER(query) LIKE '%JOIN%' THEN 'EACH WITH ALL'
                        ELSE 'OTHER'
                    END as job_type,
                    job_id,
                    total_slot_ms,
                    total_bytes_processed
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                    AND job_type = 'QUERY'
                    AND query IS NOT NULL
            )
            SELECT 
                job_type,
                COUNT(*) as jobs,
                COUNT(*) as job_stages,  -- Simplified assumption
                FORMAT('%\'d', CAST(AVG(total_bytes_processed / 1000) AS INT64)) as avg_records_read,
                FORMAT('%\'d', CAST(AVG(total_bytes_processed / 2000) AS INT64)) as avg_records_written,
                FORMAT('%\'d', CAST(AVG(total_slot_ms) AS INT64)) as avg_slot_ms
            FROM job_analysis
            WHERE job_type != 'OTHER'
            GROUP BY job_type
            ORDER BY jobs DESC
            LIMIT 6
        """
        
        # Top queries
        top_queries_query = f"""
            SELECT 
                job_id,
                SUBSTR(query, 1, 50) as query_text,
                query
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
                AND query IS NOT NULL
                AND total_slot_ms > 0
            ORDER BY total_slot_ms DESC
            LIMIT 5
        """
        
        # Top tables (using referenced tables from jobs)
        top_tables_query = f"""
            WITH table_usage AS (
                SELECT 
                    project_id,
                    'dataset_name' as dataset_id,  -- Simplified for demo
                    'table_name' as table_id,      -- Simplified for demo
                    COUNT(DISTINCT job_id) as unique_jobs,
                    SUM(total_bytes_processed) / POW(10, 12) as tb_processed,
                    AVG(total_bytes_processed) / POW(10, 9) as avg_gb_processed
                FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                    AND job_type = 'QUERY'
                    AND total_bytes_processed > 0
                GROUP BY project_id
                ORDER BY tb_processed DESC
                LIMIT 5
            )
            SELECT 
                project_id,
                dataset_id,
                table_id,
                unique_jobs,
                CONCAT(FORMAT('%.2f', tb_processed), ' TiB') as jobs_phases,
                CONCAT(FORMAT('%.0f', avg_gb_processed), ' GiB') as jobs_average,
                ROUND(RAND() * 5 + 1, 1) as jobs_reserve  -- Mock data for reserve
            FROM table_usage
        """
        
        # Spilled to disk analysis
        spilled_query = f"""
            SELECT 
                0.0 as avg_spilled_mb  -- This would require detailed job stage analysis
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {hours} HOUR)
                AND job_type = 'QUERY'
            LIMIT 1
        """
        
        # Execute queries
        jobs_by_hour_job = bq_client.query(jobs_by_hour_query)
        job_types_job = bq_client.query(job_types_query)
        top_queries_job = bq_client.query(top_queries_query)
        top_tables_job = bq_client.query(top_tables_query)
        spilled_job = bq_client.query(spilled_query)
        
        # Process results
        jobs_by_hour_data = [dict(row) for row in jobs_by_hour_job.result()]
        job_types_data = [dict(row) for row in job_types_job.result()]
        top_queries_data = [dict(row) for row in top_queries_job.result()]
        top_tables_data = [dict(row) for row in top_tables_job.result()]
        spilled_data = list(spilled_job.result())[0] if spilled_job.result().total_rows > 0 else {'avg_spilled_mb': 0.0}
        
        # Format jobs by hour data
        jobs_formatted = []
        for row in jobs_by_hour_data:
            jobs_formatted.append({
                'hour': f"{row['hour']:02d}:00",
                'jobs': int(row['jobs'])
            })
        
        # Format job types data
        job_types_formatted = []
        for row in job_types_data:
            job_types_formatted.append({
                'jobType': row['job_type'],
                'jobs': int(row['jobs']),
                'jobStages': int(row['job_stages']),
                'avgRecordsRead': row['avg_records_read'],
                'avgRecordsWritten': row['avg_records_written'],
                'avgSlotMs': row['avg_slot_ms']
            })
        
        # Format top queries data
        queries_formatted = []
        for row in top_queries_data:
            queries_formatted.append({
                'jobId': row['job_id'][:12] + '...',
                'queryText': row['query_text'] + '...',
                'query': row['query']
            })
        
        # Format top tables data
        tables_formatted = []
        for row in top_tables_data:
            tables_formatted.append({
                'project': row['project_id'],
                'dataset': row['dataset_id'],
                'table': row['table_id'],
                'uniqueJobs': int(row['unique_jobs']),
                'jobsPhases': row['jobs_phases'],
                'jobsAverage': row['jobs_average'],
                'jobsReserve': float(row['jobs_reserve'])
            })
        
        investigation_data = {
            'jobsByHour': jobs_formatted,
            'jobTypes': job_types_formatted,
            'spilledToDisk': {
                'average': round(float(spilled_data.get('avg_spilled_mb', 0)), 2),
                'unit': 'MiB/QUERY'
            },
            'topQueries': queries_formatted,
            'topTables': tables_formatted
        }
        
        return jsonify(investigation_data)
        
    except Exception as e:
        print(f"Error fetching time window investigation data: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=config.DEBUG, host=config.HOST, port=config.PORT)