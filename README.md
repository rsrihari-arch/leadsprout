# LeadSprout

Self-hosted B2B lead generation system. Search by company name → get people with LinkedIn profiles, emails, and phone numbers.

## Architecture

```
Frontend (React + Vite + Tailwind)
    ↓ POST /search-leads
Backend (Fastify)
    ↓ Adds job to queue
BullMQ Worker (Redis)
    ↓ Runs pipeline
Pipeline: Google Search → Lead Discovery → Filter → LinkedIn Validate → Email Generate → Phone Find → Save to PostgreSQL
```

## Prerequisites

- **Node.js** v18+ (installed via nvm)
- **PostgreSQL** running on localhost:5432
- **Redis** running on localhost:6379

## Quick Start

### 1. Database Setup

```bash
# Create the database
createdb leadsprout

# Or via psql:
psql -U postgres -c "CREATE DATABASE leadsprout;"
```

The `leads` table is created automatically on first server start.

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials
```

### 3. Run Everything

```bash
./run.sh
```

Or run manually:

```bash
# Terminal 1 — Backend
cd backend
npm install
node server.js

# Terminal 2 — Worker
cd backend
node workers/leadWorker.js

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```

### 4. Open the App

Go to **http://localhost:5173**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/search-leads` | Start a lead search job. Body: `{ query: "Razorpay", roles: ["CFO", "CEO"] }` |
| GET | `/job/:jobId` | Check job status and progress |
| GET | `/leads/:jobId` | Get leads for a specific job |
| GET | `/leads` | Get all leads |
| GET | `/health` | Health check |

## Sample Test Query

```bash
curl -X POST http://localhost:3001/search-leads \
  -H "Content-Type: application/json" \
  -d '{"query": "Razorpay", "roles": ["CFO", "CEO", "Founder"]}'
```

## Project Structure

```
leadsprout/
├── backend/
│   ├── server.js              # Fastify API server
│   ├── db.js                  # PostgreSQL connection + queries
│   ├── modules/
│   │   ├── googleScraper.js   # Google search + HTML parsing
│   │   ├── leadDiscovery.js   # LinkedIn profile discovery
│   │   ├── linkedinValidator.js # URL + name validation
│   │   ├── emailGenerator.js  # Pattern-based email generation
│   │   ├── phoneFinder.js     # Phone number search
│   │   ├── leadFilter.js      # Title/role filtering
│   │   └── pipeline.js        # Orchestrates the full flow
│   └── workers/
│       └── leadWorker.js      # BullMQ job processor
├── frontend/
│   └── src/
│       └── App.jsx            # React UI
├── run.sh                     # One-click startup
└── README.md
```

## What to Expect (V1)

- LinkedIn URLs: good accuracy
- Emails: decent accuracy (pattern-based)
- Phones: 10-30% hit rate (normal for Google scraping)

## Future Improvements

- Better Google scraping (rotate proxies, use SerpAPI)
- Directory scraping for phone numbers
- Smarter name parsing (handle non-English names)
- ICP-based search (not just company-level)
- Add Apollo.io / Hunter.io API integrations for verified data
