# BigQuery Performance Optimization Toolkit

This web application provides a dashboard to monitor and optimize Google BigQuery performance. It helps users identify resource-intensive queries, analyze their structure, and receive AI-powered recommendations for optimization.

## Features

- **Organization Overview:** View a high-level summary of BigQuery usage across all projects, including total queries, slot hours, and active users.
- **Operational Dashboard:** A detailed dashboard with metrics on slot usage, job concurrency, error rates, and average job duration.
- **Expensive Queries Analysis:**
  - Lists the top 10 most expensive queries based on slot milliseconds.
  - View the full SQL and referenced table schemas (DDL) for any selected query.
- **AI-Powered Optimization:**
  - For any expensive query, get optimization suggestions and a rewritten query from the Gemini AI model.
  - The AI analyzes the query and its underlying table structures to provide actionable recommendations.

## Tech Stack

- **Backend:** Python (Flask) with the Google ADK (Agent Development Kit).
- **Frontend:** React (Vite)
- **Cloud:** Google BigQuery for data analysis.
- **AI:** Google's Gemini model for query optimization.

## Setup and Configuration

Follow these steps to set up and run the application locally.

### 1. Prerequisites

- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) installed and authenticated (`gcloud auth application-default login`).
- [Python 3.10+](https://www.python.org/downloads/)
- [Node.js 18+](https://nodejs.org/en)

### 2. Backend Setup

The backend is a Python Flask application.

```bash
# Navigate to the backend directory
cd backend

# Create and activate a Python virtual environment
python -m venv myenv
source myenv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Create the environment file
cp ../.env.example .env
```

Now, edit the `backend/.env` file and add your Google Cloud Project ID and your Gemini API Key:

```env
GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
GEMINI_API_KEY="your-gemini-api-key"
```

### 3. Frontend Setup

The frontend is a React application built with Vite.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Create the environment file
cp ../.env.example .env
```

The `frontend/.env` file is already configured to point to the local backend server. No changes are needed unless you are running the backend on a different port.

### 4. Running the Application

You can run the frontend and backend servers from the root directory using the concurrently package.

```bash
# From the project root directory
npm install
npm run dev
```

Alternatively, you can run them in separate terminals:

- **Backend Terminal:**
  ```bash
  cd backend
  source myenv/bin/activate
  python app.py
  ```
- **Frontend Terminal:**
  ```bash
  cd frontend
  npm run dev
  ```

The application will be available at `http://localhost:3000`.
