# Lightning McQueen — Good Driver Incentive Program

Team 07's driver rewards app (CPSC 4910). Drivers apply to sponsor programs and
earn points for good driving; sponsors review applications and manage point
rules; admins manage driver accounts.

Live at https://pqo7vj4gc4.execute-api.us-east-2.amazonaws.com/

## Project structure

- `index.js` — the Express API. **This is the only backend**: every endpoint
  goes here, and it runs the same code locally and on AWS.
- `src/` — the React frontend (Vite).
- `lambda.js` — wraps the Express app for AWS Lambda.
- `frontend.js` — serves the built React app (`dist/`) from Lambda.
- `serverless.yml` — the AWS deployment (one stack for API + frontend).
- `backend/db/migrations/` and `backend/db/seeds/` — SQL for the MySQL database.

## Setup

Create a `.env` file in the repo root (it is gitignored):

```
DB_HOST='host name'
DB_PORT='3306'
DB_USER='user name'
DB_PASSWORD='password'
DB_NAME='DB name'
SESSION_SECRET='random long string'
```

Then install dependencies from the repo root:

```bash
npm install
```

## Run the app locally

Open two terminals, both in the repo root.

Start the API (http://localhost:4000):

```bash
npm run server
```

Start the frontend (http://localhost:5173):

```bash
npm run dev
```

Vite proxies `/api` requests to the API on port 4000. Locally, sessions are kept
in memory, so restarting the API logs everyone out.

## Database

Run the files in `backend/db/migrations/` against the database, in order:
`002_driver_applications.sql`, `003_sponsor_id_on_users.sql`,
`pt_management.sql`, `004_sessions_table.sql`. The sessions table is required
on AWS, where logins are stored in MySQL instead of memory.

`backend/db/seeds/sponsor_review_test_data.sql` adds a test sponsor and a test
driver; see the comments at the top of that file for the logins.

## Deploy to AWS

From the repo root, with the `.env` above:

```bash
set -a && source .env && set +a && npm run deploy
```

This builds the frontend and deploys the API (`/api/*`) and the frontend
(everything else) as the `lightning-mcqueen-app` stack in `us-east-2`. The URL
stays the same across deploys.
