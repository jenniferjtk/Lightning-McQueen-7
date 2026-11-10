# Lightning McQueen — Good Driver Incentive Program

Team 07's driver rewards app (CPSC 4910). Drivers apply to sponsor programs and
earn points for good driving; sponsors review applications and manage point
rules; admins manage driver accounts.

Sponsors and admins can use Reports to view the Sponsor Report's Driver Point
Tracking with driver and date-range filters, and download the results as CSV.

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

## Run the tests

```bash
npm test
```

API tests (`tests/api/`) call the Express routes with Supertest against a mocked
database, so no `.env` or MySQL is needed. Frontend tests (`tests/frontend/`)
render React components with React Testing Library. `npm run test:watch` reruns
them on save. GitHub Actions runs the suite and the build on every push to
`main` and every pull request (`.github/workflows/test.yml`).

## Database

Run the files in `backend/db/migrations/` against the database, in order:
`002_driver_applications.sql`, `003_sponsor_id_on_users.sql`,
`pt_management.sql`, `004_sessions_table.sql`, and
`005_point_change_reports.sql`, and `006_audit_events.sql`. The sessions table
is required on AWS, where
logins are stored in MySQL instead of memory. The point-change reports table
stores driver and sponsor reports for administrator review. The `audit_events`
table records password changes and login attempts for the sponsor Audit Log
report; application decisions are read from `driver_applications`, and point
changes from `point_audit_log`.
`005_point_change_reports.sql`, `006_shipping_address_and_catalog_stock.sql`,
and `007_orders.sql`.
The sessions table is required on AWS, where
logins are stored in MySQL instead of memory. The point-change reports table
stores driver and sponsor reports for administrator review. The orders table
holds catalog redemptions; a driver's balance with a sponsor is the points
that sponsor awarded minus their orders with it that aren't canceled.

`backend/db/seeds/sponsor_review_test_data.sql` adds a test sponsor and a test
driver; see the comments at the top of that file for the logins.
`backend/db/seeds/point_history_demo_data.sql` (run after it) gives that test
driver a few weeks of demo point history for the dashboard charts.

## Deploy to AWS

Every push to `main` deploys automatically once the tests pass (the `deploy`
job in `.github/workflows/test.yml`). It can also be rerun by hand from the
Actions tab ("Tests" → "Run workflow"). It needs these repository secrets in
Settings → Secrets and variables → Actions; without them the deploy step is
skipped:

- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: an IAM user allowed to deploy
  the stack in the CPSC 4910 account
- `SERVERLESS_ACCESS_KEY`: from the `jennagracejohnson3` Serverless dashboard
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `SESSION_SECRET` (and
  optionally `DB_PORT`): the same values as `.env`

Migrations are not run by the workflow. Apply new files in
`backend/db/migrations/` to the database before merging code that needs them.

To deploy by hand instead, from the repo root, with the `.env` above:

```bash
set -a && source .env && set +a && npm run deploy
```

This builds the frontend and deploys the API (`/api/*`) and the frontend
(everything else) as the `lightning-mcqueen-app` stack in `us-east-2`. The URL
stays the same across deploys.
