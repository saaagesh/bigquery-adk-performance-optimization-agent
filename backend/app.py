import os
import uuid
import json
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from google.cloud import bigquery
import google.generativeai as genai
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

# Initialize Gemini model directly
if config.GEMINI_API_KEY:
    genai.configure(api_key=config.GEMINI_API_KEY)
    model = genai.GenerativeModel(config.GEMINI_MODEL)
else:
    model = None

def log_api_call(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        print(f"\n--- API Call Received ---")
        print(f"Endpoint: {request.path}")
        print(f"Method: {request.method}")
        if request.method == 'POST':
            try:
                print(f"Payload: {json.dumps(request.json, indent=2)}")
            except Exception:
                print(f"Payload: {request.data}")
        print(f"-------------------------")
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/expensive-queries', methods=['GET'])
@log_api_call
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
@log_api_call
def get_query_details():
    """
    Fetches the DDL for tables referenced in a specific BigQuery job.
    """
    import json
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500

    data = request.get_json()
    job_id = data.get('job_id')
    location = data.get('location', 'US')

    if not job_id:
        return jsonify({"error": "job_id is required"}), 400

    try:
        print(f"Attempting to get job {job_id} directly.")
        job = bq_client.get_job(job_id, location=location or config.BIGQUERY_LOCATION)

        print(f"Fetched job {job_id}. Job type: {job.job_type}, State: {job.state}")
        print(f"Type of job object: {type(job)}")

        # Detailed logging for debugging performance insights
        print(f"--- Detailed Job Info for {job_id} ---")
        job_statistics = getattr(job, 'statistics', None)
        if job_statistics is not None:
            print("Found 'statistics' attribute. Logging its content:")
            try:
                # The statistics object can be complex, converting to dict helps logging
                import json
                stats_dict = getattr(job_statistics, 'to_api_repr', lambda: str(job_statistics))()
                if isinstance(stats_dict, dict):
                    print(json.dumps(stats_dict, indent=2))
                else:
                    print(stats_dict)
            except Exception as e:
                print(f"Could not serialize job.statistics to JSON: {e}. Printing raw object:")
                print(str(job_statistics))
        else:
            print("No 'statistics' attribute found for job.")
        print("------------------------------------")

        execution_plan = []
        execution_plan_summary = ""
        if job.query_plan:
            print(f"Query plan found for job {job_id}. Number of stages: {len(job.query_plan)}")
            for stage in job.query_plan:
                execution_plan.append({
                    "id": getattr(stage, 'entry_id', 'N/A'), # Corrected attribute
                    "name": getattr(stage, 'name', 'N/A'),
                    "status": getattr(stage, 'status', 'N/A'),
                    "recordsRead": getattr(stage, 'records_read', 'N/A'),
                    "recordsWritten": getattr(stage, 'records_written', 'N/A'),
                    "inputBytes": getattr(stage, 'input_data_processed', 'N/A'), # Corrected attribute
                    "outputBytes": getattr(stage, 'output_data_processed', 'N/A'), # Corrected attribute
                    "steps": [{
                        "kind": step.kind,
                        "substeps": step.substeps
                    } for step in getattr(stage, 'steps', [])] if getattr(stage, 'steps', []) else [],
                    "shuffledWorkerLeakage": getattr(stage, 'shuffled_worker_leakage_bytes', 0) > 0
                })
            
            # Generate Gemini explanation for the execution plan
            if config.GEMINI_API_KEY and model:
                try:
                    plan_prompt = f"""You are a Google Cloud BigQuery expert. Provide a concise, human-readable explanation and key insights for the following BigQuery execution plan. Focus on identifying potential bottlenecks, expensive stages, and areas for optimization. The explanation should be in markdown format.

**BIGQUERY EXECUTION PLAN (JSON):**
```json
{json.dumps(execution_plan, indent=2)}
```

**QUERY:**
```sql
{job.query}
```

Provide a summary of the plan, highlight critical stages, and suggest general optimization strategies based on the plan details.
"""
                    print("--- GEMINI API CALL (Execution Plan Explanation) START ---")
                    print(f"Gemini Prompt (Execution Plan):\n{plan_prompt[:1000]}... (truncated)")
                    gemini_response = model.generate_content(plan_prompt)
                    if gemini_response and gemini_response.text:
                        execution_plan_summary = gemini_response.text
                        print(f"Generated execution plan summary length: {len(execution_plan_summary)}")
                        print(f"Full Execution Plan Summary:\n{execution_plan_summary[:1000]}... (truncated)") # Log full summary
                    else:
                        execution_plan_summary = "Unable to generate an explanation for the execution plan at this time."
                    print("--- GEMINI API CALL (Execution Plan Explanation) END ---")
                except Exception as gemini_e:
                    print(f"Error generating execution plan explanation with Gemini: {gemini_e}")
                    execution_plan_summary = f"Error generating explanation: {gemini_e}"
        else:
            print(f"No query plan found for job {job_id}.")

        performance_insights = None
        if job.job_type == "QUERY" and job.state == 'DONE':
            print(f"\n=== PERFORMANCE INSIGHTS RETRIEVAL FOR JOB {job_id} ===")
            print(f"Job type: {job.job_type}, Job state: {job.state}")
            print(f"Attempting to fetch performance insights from INFORMATION_SCHEMA...")
            
            try:
                # Query INFORMATION_SCHEMA to get performance insights
                performance_insights_query = f"""
                    SELECT
                        job_id,
                        query_info.performance_insights
                    FROM
                        `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                    WHERE
                        job_id = '{job_id}'
                        AND job_type = 'QUERY'
                        AND state = 'DONE'
                        AND error_result IS NULL
                    LIMIT 1
                """
                
                print(f"Executing performance insights query:\n{performance_insights_query}")
                insights_job = bq_client.query(performance_insights_query)
                insights_results = list(insights_job.result())
                
                print(f"Query executed. Found {len(insights_results)} results.")
                
                if insights_results and len(insights_results) > 0:
                    result_row = insights_results[0]
                    insights_data = result_row.get('performance_insights')
                    
                    print(f"Raw performance insights data type: {type(insights_data)}")
                    print(f"Performance insights data: {insights_data}")
                    
                    if insights_data is not None:
                        print(f"✅ Performance insights found for job {job_id}! Processing insights data...")
                        
                        # Extract performance insights data
                        performance_insights = {
                            "available": True,
                            "stage_performance_standalone_insights": [],
                            "stage_performance_change_insights": [],
                            "slot_contention_detected": False,
                            "insufficient_shuffle_quota_detected": False,
                            "recommendations": [],
                            "warnings": [],
                            "raw_data": str(insights_data)  # Include raw data for debugging
                        }
                        
                        # Process standalone insights
                        if hasattr(insights_data, 'stage_performance_standalone_insights') and insights_data.stage_performance_standalone_insights:
                            print(f"Processing {len(insights_data.stage_performance_standalone_insights)} standalone insights...")
                            for i, insight in enumerate(insights_data.stage_performance_standalone_insights):
                                print(f"  Standalone insight {i+1}: stage_id={getattr(insight, 'stage_id', 'N/A')}, slot_contention={getattr(insight, 'slot_contention', False)}, insufficient_shuffle_quota={getattr(insight, 'insufficient_shuffle_quota', False)}")
                                
                                standalone_insight = {
                                    "stage_id": getattr(insight, 'stage_id', 'N/A'),
                                    "slot_contention": getattr(insight, 'slot_contention', False),
                                    "insufficient_shuffle_quota": getattr(insight, 'insufficient_shuffle_quota', False)
                                }
                                performance_insights["stage_performance_standalone_insights"].append(standalone_insight)
                                
                                if standalone_insight["slot_contention"]:
                                    performance_insights["slot_contention_detected"] = True
                                    rec = f"Stage {standalone_insight['stage_id']}: Consider increasing slot allocation to reduce contention"
                                    performance_insights["recommendations"].append(rec)
                                    print(f"  ⚠️  Slot contention detected! Added recommendation: {rec}")
                                
                                if standalone_insight["insufficient_shuffle_quota"]:
                                    performance_insights["insufficient_shuffle_quota_detected"] = True
                                    rec = f"Stage {standalone_insight['stage_id']}: Insufficient shuffle quota detected, consider optimizing data distribution"
                                    performance_insights["recommendations"].append(rec)
                                    print(f"  ⚠️  Insufficient shuffle quota detected! Added recommendation: {rec}")
                        else:
                            print("  No standalone insights found.")
                        
                        # Process change insights
                        if hasattr(insights_data, 'stage_performance_change_insights') and insights_data.stage_performance_change_insights:
                            print(f"Processing {len(insights_data.stage_performance_change_insights)} change insights...")
                            for i, insight in enumerate(insights_data.stage_performance_change_insights):
                                change_insight = {
                                    "stage_id": getattr(insight, 'stage_id', 'N/A')
                                }
                                
                                # Check for input data changes
                                if hasattr(insight, 'input_data_change') and insight.input_data_change:
                                    input_change = insight.input_data_change
                                    diff_pct = getattr(input_change, 'records_read_diff_percentage', None)
                                    change_insight["input_data_change"] = {
                                        "records_read_diff_percentage": diff_pct
                                    }
                                    
                                    print(f"  Change insight {i+1}: stage_id={change_insight['stage_id']}, records_read_diff={diff_pct}%")
                                    
                                    if diff_pct is not None and abs(diff_pct) > 20:  # Significant change
                                        warning = f"Stage {change_insight['stage_id']}: Significant change in records read ({diff_pct:+.1f}%)"
                                        performance_insights["warnings"].append(warning)
                                        print(f"  ⚠️  Significant data change detected! Added warning: {warning}")
                                
                                performance_insights["stage_performance_change_insights"].append(change_insight)
                        else:
                            print("  No change insights found.")
                        
                        print(f"\n📊 Performance insights summary for job {job_id}:")
                        print(f"  - Standalone insights: {len(performance_insights['stage_performance_standalone_insights'])}")
                        print(f"  - Change insights: {len(performance_insights['stage_performance_change_insights'])}")
                        print(f"  - Recommendations: {len(performance_insights['recommendations'])}")
                        print(f"  - Warnings: {len(performance_insights['warnings'])}")
                        print(f"  - Slot contention detected: {performance_insights['slot_contention_detected']}")
                        print(f"  - Shuffle quota issues: {performance_insights['insufficient_shuffle_quota_detected']}")
                        
                    else:
                        print(f"❌ Performance insights data is None for job {job_id}")
                        performance_insights = {
                            "available": False,
                            "message": "Performance insights data is null"
                        }
                        
                else:
                    print(f"❌ No results found in INFORMATION_SCHEMA for job {job_id}")
                    print("This could mean:")
                    print("  - The job is too old (> 180 days)")
                    print("  - The job didn't complete successfully")
                    print("  - The job doesn't have performance insights available")
                    performance_insights = {
                        "available": False,
                        "message": "No performance insights found in INFORMATION_SCHEMA"
                    }
                    
            except Exception as insights_e:
                print(f"❌ ERROR fetching performance insights from INFORMATION_SCHEMA for job {job_id}:")
                print(f"   Error type: {type(insights_e).__name__}")
                print(f"   Error message: {str(insights_e)}")
                import traceback
                print(f"   Traceback: {traceback.format_exc()}")
                performance_insights = {
                    "available": False,
                    "error": str(insights_e),
                    "message": "Error retrieving performance insights"
                }
            
            print(f"=== END PERFORMANCE INSIGHTS RETRIEVAL ===")
        else:
            print(f"❌ Job {job_id} is not eligible for performance insights:")
            print(f"   Job type: {job.job_type} (expected: QUERY)")
            print(f"   Job state: {getattr(job, 'state', 'unknown')} (expected: DONE)")
            performance_insights = {
                "available": False,
                "message": "Performance insights only available for completed QUERY jobs"
            }

        # Schema retrieval with fallback mechanisms
        ddl_statements = []
        tables_to_fetch = []
        
        # First, try to get tables from job.referenced_tables
        if job.referenced_tables:
            print(f"Referenced tables found for job {job_id}. Attempting to fetch DDL for {len(job.referenced_tables)} tables.")
            for table_ref in job.referenced_tables:
                tables_to_fetch.append({
                    'project': table_ref.project,
                    'dataset': table_ref.dataset_id,
                    'table': table_ref.table_id,
                    'source': 'job_metadata'
                })
        else:
            print(f"No referenced tables found in job metadata for {job_id}. Attempting to parse query for table references.")
            
            # Fallback: Parse the SQL query to extract table references
            if job.query:
                import re
                
                # Remove comments and normalize whitespace
                query_clean = re.sub(r'/\*.*?\*/', '', job.query, flags=re.DOTALL)
                query_clean = re.sub(r'--.*?\n', '\n', query_clean)
                query_clean = re.sub(r'\s+', ' ', query_clean)
                
                # Pattern to match table references: project.dataset.table or `project.dataset.table`
                table_patterns = [
                    r'FROM\s+`([^`]+)`',  # FROM `project.dataset.table`
                    r'JOIN\s+`([^`]+)`',  # JOIN `project.dataset.table`
                    r'FROM\s+([\w\.-]+)',  # FROM project.dataset.table
                    r'JOIN\s+([\w\.-]+)',  # JOIN project.dataset.table
                    r'WITH\s+[\w\s]*\s+AS\s*\(\s*SELECT\s+.*?FROM\s+`([^`]+)`',  # CTEs
                    r'WITH\s+[\w\s]*\s+AS\s*\(\s*SELECT\s+.*?FROM\s+([\w\.-]+)',  # CTEs without backticks
                ]
                
                found_tables = set()
                for pattern in table_patterns:
                    matches = re.findall(pattern, query_clean, re.IGNORECASE)
                    for match in matches:
                        table_name = match.strip('`').strip()
                        if '.' in table_name:  # Ensure it looks like a fully qualified table name
                            found_tables.add(table_name)
                
                print(f"Parsed {len(found_tables)} table references from query: {list(found_tables)}")
                
                for table_name in found_tables:
                    parts = table_name.split('.')
                    if len(parts) >= 3:
                        tables_to_fetch.append({
                            'project': parts[0],
                            'dataset': parts[1],
                            'table': parts[2],
                            'source': 'query_parsing'
                        })
                    elif len(parts) == 2 and project_id:
                        # Assume current project if only dataset.table provided
                        tables_to_fetch.append({
                            'project': project_id,
                            'dataset': parts[0],
                            'table': parts[1],
                            'source': 'query_parsing_inferred_project'
                        })
        
        # Fetch DDL for all identified tables
        if tables_to_fetch:
            print(f"Fetching DDL for {len(tables_to_fetch)} tables from various sources.")
            for table_info in tables_to_fetch:
                try:
                    table_id = f"{table_info['project']}.{table_info['dataset']}.{table_info['table']}"
                    print(f"Fetching schema for {table_id} (source: {table_info['source']})")
                    
                    table = bq_client.get_table(table_id)
                    
                    if table.view_query:
                        ddl = f"-- View: {table_id} (source: {table_info['source']})\nCREATE OR REPLACE VIEW `{table_id}` AS\n{table.view_query}"
                    else:
                        schema_sql = []
                        for field in table.schema:
                            # Include more detailed field information
                            field_def = f"  `{field.name}` {field.field_type}"
                            if field.mode == 'REQUIRED':
                                field_def += " NOT NULL"
                            elif field.mode == 'REPEATED':
                                field_def += " REPEATED"
                            if field.description:
                                field_def += f" -- {field.description}"
                            schema_sql.append(field_def)
                        
                        ddl = f"-- Table: {table_id} (source: {table_info['source']})\nCREATE TABLE `{table_id}` (\n" + ",\n".join(schema_sql) + "\n)"
                        
                        # Add table metadata if available
                        if hasattr(table, 'num_rows') and table.num_rows is not None:
                            ddl += f"\n-- Rows: {table.num_rows:,}"
                        if hasattr(table, 'num_bytes') and table.num_bytes is not None:
                            ddl += f"\n-- Size: {table.num_bytes / (1024**3):.2f} GB"
                        if hasattr(table, 'time_partitioning') and table.time_partitioning:
                            ddl += f"\n-- Partitioned by: {table.time_partitioning.field or 'ingestion time'}"
                        if hasattr(table, 'clustering_fields') and table.clustering_fields:
                            ddl += f"\n-- Clustered by: {', '.join(table.clustering_fields)}"
                    
                    ddl_statements.append(ddl)
                    
                except Exception as e:
                    error_msg = f"/* ERROR fetching DDL for {table_id} (source: {table_info['source']}): {e} */"
                    print(f"Error fetching DDL for table {table_id}: {e}")
                    ddl_statements.append(error_msg)
        else:
            print(f"No tables identified for schema retrieval from job {job_id}. Job type: {job.job_type}")
            ddl_statements.append("/* No table schemas could be identified from this query */")

        print(f"Sending execution_plan to UI: {json.dumps(execution_plan, indent=2)[:500]}... (truncated)")
        return jsonify({
            "query": job.query,
            "ddl": "\n\n---\n\n".join(ddl_statements),
            "execution_plan": execution_plan,
            "execution_plan_summary": execution_plan_summary, # New field
            "performance_insights": performance_insights
        })

    except Exception as e:
        print(f"Error fetching query details for job {job_id}: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/api/optimize', methods=['POST'])
@log_api_call
def optimize_query():
    """
    Uses Gemini API directly to get optimization recommendations for a query.
    """
    data = request.get_json()
    query = data.get('query')
    ddl = data.get('ddl')
    execution_plan = data.get('execution_plan', [])
    execution_plan_summary = data.get('execution_plan_summary', '')
    performance_insights = data.get('performance_insights')

    if not query:
        return jsonify({"error": "Query is required"}), 400

    print(f"Received query for optimization: {query[:200]}...")
    print(f"Received DDL for optimization: {ddl[:200] if ddl else 'No DDL provided'}...")
    print(f"Received execution plan stages: {len(execution_plan) if execution_plan else 0}")
    print(f"Received performance insights: {'Yes' if performance_insights else 'No'}")

    # Check if we have the required configuration
    if not config.GEMINI_API_KEY or not model:
        return jsonify({"error": "Gemini API key not configured or model not initialized"}), 500

    try:
        import json
        # Prepare execution plan section for the prompt
        execution_plan_text = ""
        if execution_plan and len(execution_plan) > 0:
            execution_plan_text = "**EXECUTION PLAN:**\n```json\n" + json.dumps(execution_plan, indent=2) + "\n```\n\n"
            if execution_plan_summary:
                execution_plan_text += f"**EXECUTION PLAN SUMMARY:**\n{execution_plan_summary}\n\n"
        
        # Prepare performance insights section
        performance_insights_text = ""
        if performance_insights:
            performance_insights_text = "**PERFORMANCE INSIGHTS:**\n"
            if performance_insights.get('slot_ms_diff'):
                performance_insights_text += f"- Slot milliseconds difference: {performance_insights['slot_ms_diff']}\n"
            if performance_insights.get('top_resource_contention'):
                performance_insights_text += "- Resource contention issues:\n"
                for contention in performance_insights['top_resource_contention']:
                    performance_insights_text += f"  - {contention.get('type', 'Unknown')}: {contention.get('description', 'No description')}\n"
            if performance_insights.get('recommendations'):
                performance_insights_text += "- BigQuery recommendations:\n"
                for rec in performance_insights['recommendations']:
                    performance_insights_text += f"  - {rec}\n"
            if performance_insights.get('warnings'):
                performance_insights_text += "- Warnings:\n"
                for warning in performance_insights['warnings']:
                    performance_insights_text += f"  - {warning}\n"
            performance_insights_text += "\n"

        # Create a comprehensive prompt for BigQuery optimization
        prompt_parts = [
            f"""You are a Google Cloud BigQuery optimization expert. Analyze the provided SQL query, table schemas, execution plan, and performance insights to provide specific, actionable optimization recommendations.

**QUERY TO ANALYZE:**
```sql
{query}
```

**TABLE SCHEMAS:**
```sql
{ddl if ddl else "No schema information provided - analysis will be based on query structure only"}
```

{execution_plan_text}{performance_insights_text}Please provide your analysis in the following markdown format:

## BigQuery Optimization Analysis

### Query Overview
Briefly describe what this query does and its current approach.

### Performance Issues Identified
List specific performance concerns found in the query{', execution plan' if execution_plan else ''}{', and performance insights' if performance_insights else ''}:

### Optimization Recommendations

#### 1. Query Structure Optimizations
- Specific recommendations for improving the query structure
- Focus on SELECT clause optimization, WHERE clause placement, etc.

#### 2. BigQuery-Specific Optimizations
- Partitioning strategies (if applicable)
- Clustering recommendations
- Data type optimizations
- Avoiding unnecessary data scanning

#### 3. Cost Optimization
- Ways to reduce slot usage and data processing
- Recommendations for reducing bytes billed
"""
        ]

        if execution_plan:
            prompt_parts.append("""
#### 4. Execution Plan Optimizations
- Analysis of query stages and bottlenecks
- Recommendations to improve parallelization
- Suggestions to reduce data shuffling and spills
""")

        prompt_parts.append(f"""
### Optimized Query
```sql
-- Provide an optimized version of the query
-- Include comments explaining the key changes
{query}
```

### Expected Impact
- **Performance**: Estimated improvement in execution time
- **Cost**: Potential reduction in slot usage and bytes processed
- **Scalability**: How these changes will help as data grows

### Additional Considerations
- Any trade-offs or limitations of the optimizations
- Monitoring recommendations
- Future optimization opportunities

Focus specifically on BigQuery best practices including:
- Avoiding SELECT * when possible
- Using appropriate WHERE clauses early
- Leveraging partitioning and clustering
- Optimizing JOINs and subqueries
- Using appropriate aggregation strategies
- Minimizing data movement and shuffling""")
        prompt = "".join(prompt_parts)

        print("--- GEMINI API CALL START ---")
        print(f"Gemini Prompt length: {len(prompt)} characters")
        print(f"Includes execution plan: {'Yes' if execution_plan else 'No'}")
        print(f"Includes performance insights: {'Yes' if performance_insights else 'No'}")
        print(f"Full Gemini Prompt:\n{prompt}")
        print("--- PROMPT END ---")
        
        # Generate content using Gemini
        response = model.generate_content(prompt)
        
        if response and response.text:
            recommendations = response.text
            print(f"Generated recommendations length: {len(recommendations)}")
            print(f"First 200 chars: {recommendations[:200]}...")
        else:
            recommendations = "**No recommendations generated**\n\nThe AI service did not return any recommendations. This could be due to:\n- API rate limits\n- Content filtering\n- Service availability issues\n\nPlease try again in a moment."
            print("No response text received from Gemini")

        print("--- GEMINI API CALL END ---")
        
        return jsonify({"recommendations": recommendations})
        
    except Exception as e:
        error_msg = f"Error getting optimization from Gemini: {str(e)}"
        print(error_msg)
        import traceback
        traceback.print_exc()
        
        # Return a more helpful error message
        return jsonify({
            "error": "Failed to generate AI recommendations",
            "details": str(e),
            "recommendations": f"**Error generating recommendations**\n\nThere was an issue connecting to the Gemini AI service: {str(e)}\n\n**Troubleshooting steps:**\n1. Verify your Gemini API key is valid and has proper permissions\n2. Check if you have sufficient API quota\n3. Ensure network connectivity to Google AI services\n4. Check the backend logs for more detailed error information\n\n**Current configuration:**\n- Model: {config.GEMINI_MODEL}\n- API Key configured: {'Yes' if config.GEMINI_API_KEY else 'No'}"
        }), 500

@app.route('/api/organization-overview', methods=['GET'])
@log_api_call
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
@log_api_call
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
@log_api_call
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
@log_api_call
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
@log_api_call
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
@log_api_call
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

@app.route('/api/analyze-query-manual', methods=['POST'])
@log_api_call
def analyze_query_manual():
    """
    Comprehensive analysis for manually entered queries.
    Searches for similar queries in history and provides optimization analysis.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500
    
    data = request.get_json()
    query_text = data.get('query', '')
    project_filter = data.get('project', 'any_value')
    region_filter = data.get('region', 'us')
    include_optimization = data.get('includeOptimization', True)
    include_execution_plan = data.get('includeExecutionPlan', False)
    include_performance_insights = data.get('includePerformanceInsights', False)
    
    if not query_text.strip():
        return jsonify({"error": "Query text is required"}), 400
    
    try:
        analysis_result = {
            'queryText': query_text,
            'analysisType': 'manual'
        }
        
        # Search for similar queries in history (simplified approach)
        try:
            # Extract key components for similarity search
            query_lower = query_text.lower()
            table_patterns = []
            
            # Simple pattern matching for table names
            import re
            table_matches = re.findall(r'from\s+[`"\']?([\w\.-]+)[`"\']?', query_lower)
            if table_matches:
                table_patterns.extend(table_matches)
            
            # Search for queries with similar table references
            if table_patterns and len(table_patterns) > 0:
                search_pattern = table_patterns[0].split('.')[-1]  # Get table name
                
                similar_query = f"""
                    SELECT 
                        job_id,
                        query,
                        total_slot_ms,
                        TIMESTAMP_DIFF(end_time, start_time, SECOND) as duration_seconds,
                        creation_time,
                        state
                    FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
                    WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                        AND job_type = 'QUERY'
                        AND LOWER(query) LIKE '%{search_pattern}%'
                        AND query IS NOT NULL
                    ORDER BY creation_time DESC
                    LIMIT 5
                """
                
                similar_job = bq_client.query(similar_query)
                similar_queries = [dict(row) for row in similar_job.result()]
                
                analysis_result['historicalData'] = {
                    'similarQueries': similar_queries,
                    'patterns': [
                        f"Found {len(similar_queries)} similar queries in the last 30 days",
                        f"Table pattern search: {search_pattern}"
                    ]
                }
        except Exception as e:
            print(f"Error searching similar queries: {e}")
            analysis_result['historicalData'] = {
                'similarQueries': [],
                'patterns': ["Historical search not available"]
            }
        
        # Generate optimization recommendations if requested
        if include_optimization:
            try:
                # First, try to extract table schemas from the query
                ddl_statements = []
                
                # Parse the SQL query to extract table references
                import re
                
                # Remove comments and normalize whitespace
                query_clean = re.sub(r'/\*.*?\*/', '', query_text, flags=re.DOTALL)
                query_clean = re.sub(r'--.*?\n', '\n', query_clean)
                query_clean = re.sub(r'\s+', ' ', query_clean)
                
                # Pattern to match table references
                table_patterns = [
                    r'FROM\s+`([^`]+)`',  # FROM `project.dataset.table`
                    r'JOIN\s+`([^`]+)`',  # JOIN `project.dataset.table`
                    r'FROM\s+([\w\.-]+)',  # FROM project.dataset.table
                    r'JOIN\s+([\w\.-]+)',  # JOIN project.dataset.table
                ]
                
                found_tables = set()
                for pattern in table_patterns:
                    matches = re.findall(pattern, query_clean, re.IGNORECASE)
                    for match in matches:
                        table_name = match.strip('`').strip()
                        if '.' in table_name:  # Ensure it looks like a fully qualified table name
                            found_tables.add(table_name)
                
                print(f"Parsed {len(found_tables)} table references from manual query: {list(found_tables)}")
                
                # Fetch DDL for identified tables
                if found_tables:
                    for table_name in found_tables:
                        parts = table_name.split('.')
                        if len(parts) >= 3:
                            table_id = table_name
                        elif len(parts) == 2:
                            # Assume current project if only dataset.table provided
                            table_id = f"{project_id or 'current_project'}.{table_name}"
                        else:
                            continue
                            
                        try:
                            print(f"Fetching schema for {table_id} (manual query analysis)")
                            table = bq_client.get_table(table_id)
                            
                            if table.view_query:
                                ddl = f"-- View: {table_id}\nCREATE OR REPLACE VIEW `{table_id}` AS\n{table.view_query}"
                            else:
                                schema_sql = []
                                for field in table.schema:
                                    field_def = f"  `{field.name}` {field.field_type}"
                                    if field.mode == 'REQUIRED':
                                        field_def += " NOT NULL"
                                    elif field.mode == 'REPEATED':
                                        field_def += " REPEATED"
                                    schema_sql.append(field_def)
                                
                                ddl = f"-- Table: {table_id}\nCREATE TABLE `{table_id}` (\n" + ",\n".join(schema_sql) + "\n)"
                                
                                # Add table metadata if available
                                if hasattr(table, 'num_rows') and table.num_rows is not None:
                                    ddl += f"\n-- Rows: {table.num_rows:,}"
                                if hasattr(table, 'num_bytes') and table.num_bytes is not None:
                                    ddl += f"\n-- Size: {table.num_bytes / (1024**3):.2f} GB"
                            
                            ddl_statements.append(ddl)
                            
                        except Exception as e:
                            error_msg = f"/* ERROR fetching DDL for {table_id}: {e} */"
                            print(f"Error fetching DDL for table {table_id}: {e}")
                            ddl_statements.append(error_msg)
                
                # Join all DDL statements
                ddl_text = "\n\n---\n\n".join(ddl_statements) if ddl_statements else ''
                
                print(f"Manual query analysis - DDL length: {len(ddl_text)}")
                
                # Call optimize function with extracted DDL
                if config.GEMINI_API_KEY and model:
                    prompt = f"""You are a Google Cloud BigQuery optimization expert. Analyze the provided SQL query and table schemas to provide specific, actionable optimization recommendations.

**QUERY TO ANALYZE:**
```sql
{query_text}
```

**TABLE SCHEMAS:**
```sql
{ddl_text if ddl_text else "No schema information provided - analysis will be based on query structure only"}
```

Please provide your analysis in markdown format with specific BigQuery optimization recommendations focusing on:
- Query structure optimizations
- Performance improvements
- Cost reduction strategies
- Best practices implementation
"""
                    
                    response = model.generate_content(prompt)
                    if response and response.text:
                        analysis_result['optimization'] = {
                            'recommendations': response.text,
                            'source': 'gemini_ai_with_schema' if ddl_text else 'gemini_ai_structure_only',
                            'schema_info': f"Analyzed with {len(ddl_statements)} table schemas" if ddl_statements else "No table schemas available"
                        }
                    else:
                        analysis_result['optimization'] = {
                            'recommendations': 'Unable to generate AI recommendations at this time.',
                            'source': 'error'
                        }
                else:
                    analysis_result['optimization'] = {
                        'recommendations': 'Gemini AI not configured. Please check your API key configuration.',
                        'source': 'config_error'
                    }
            except Exception as e:
                print(f"Error getting optimization recommendations: {e}")
                analysis_result['optimization'] = {
                    'recommendations': f'Error generating recommendations: {str(e)}',
                    'source': 'error'
                }
        
        # Execution plan analysis (placeholder for future implementation)
        if include_execution_plan:
            analysis_result['executionPlan'] = {
                'available': False,
                'message': 'Execution plan analysis requires running the query. This feature will be implemented to show estimated execution plan.'
            }
        
        # Performance insights (placeholder for future implementation)
        if include_performance_insights:
            analysis_result['performanceInsights'] = {
                'available': False,
                'message': 'Performance insights require historical execution data. Run this query to get detailed insights.'
            }
        
        return jsonify(analysis_result)
        
    except Exception as e:
        print(f"Error in manual query analysis: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/search-historical-queries', methods=['POST'])
@log_api_call
def search_historical_queries():
    """
    Search for similar queries in BigQuery job history.
    """
    if not bq_client:
        return jsonify({"error": "BigQuery client not initialized"}), 500
    
    data = request.get_json()
    query_text = data.get('query', '')
    project_filter = data.get('project', 'any_value')
    region_filter = data.get('region', 'us')
    
    if not query_text.strip():
        return jsonify({"error": "Query text is required"}), 400
    
    try:
        # Extract keywords for similarity search
        query_lower = query_text.lower()
        
        # Simple keyword extraction
        import re
        keywords = re.findall(r'\b(select|from|where|join|group by|order by|having)\b', query_lower)
        table_names = re.findall(r'from\s+[`"\']?([\w\.-]+)[`"\']?', query_lower)
        
        search_conditions = []
        
        # Search by table names if found
        if table_names:
            for table in table_names[:2]:  # Limit to first 2 tables
                table_name = table.split('.')[-1]  # Get just the table name
                search_conditions.append(f"LOWER(query) LIKE '%{table_name}%'")
        
        # If no table names, search by query patterns
        if not search_conditions:
            if 'join' in keywords:
                search_conditions.append("LOWER(query) LIKE '%join%'")
            if 'group by' in query_lower:
                search_conditions.append("LOWER(query) LIKE '%group by%'")
            if 'order by' in query_lower:
                search_conditions.append("LOWER(query) LIKE '%order by%'")
        
        if not search_conditions:
            search_conditions.append("LOWER(query) LIKE '%select%'")  # Fallback
        
        where_clause = " OR ".join(search_conditions)
        
        similar_queries_sql = f"""
            SELECT 
                job_id,
                LEFT(query, 200) as query_preview,
                total_slot_ms,
                TIMESTAMP_DIFF(end_time, start_time, SECOND) as execution_time,
                creation_time,
                state,
                user_email
            FROM `region-us.INFORMATION_SCHEMA.JOBS_BY_PROJECT`
            WHERE creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
                AND job_type = 'QUERY'
                AND ({where_clause})
                AND query IS NOT NULL
                AND total_slot_ms > 0
            ORDER BY creation_time DESC
            LIMIT 10
        """
        
        query_job = bq_client.query(similar_queries_sql)
        results = [dict(row) for row in query_job.result()]
        
        # Calculate similarity scores (simplified)
        for result in results:
            # Simple similarity based on common keywords
            similarity = 75 + (len(set(keywords) & set(re.findall(r'\w+', result['query_preview'].lower()))) * 5)
            result['similarity'] = min(similarity, 95)
        
        # Generate usage patterns
        patterns = [
            f"Found {len(results)} similar queries in the last 30 days",
        ]
        
        if results:
            avg_execution_time = sum(r['execution_time'] or 0 for r in results) / len(results)
            patterns.append(f"Average execution time: {avg_execution_time:.1f} seconds")
            
            total_slot_ms = sum(r['total_slot_ms'] or 0 for r in results)
            patterns.append(f"Total slot usage: {total_slot_ms:,.0f} slot milliseconds")
        
        return jsonify({
            'similarQueries': results,
            'patterns': patterns,
            'searchTerms': table_names + keywords
        })
        
    except Exception as e:
        print(f"Error searching historical queries: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=config.DEBUG, host=config.HOST, port=config.PORT)
