# Driver Dashboard

A basic homepage for a driver rewards app with a top navigation bar, point balance, profile information, and recent purchases.

## Project structure

This project currently uses a single root folder with:
- a Node/Express API file at `index.js`
- a React frontend app in `src/`

## Run the app locally

Open two terminal windows.

### 1. Start the API
```bash
cd project
npm install
npm run server
```

The API runs at:
- http://localhost:4000/api/driver

### 2. Start the frontend
In a second terminal:
```bash
cd project
npm install
npm run dev -- --host 0.0.0.0
```

The frontend runs at:
- http://localhost:5173/

The Vite config proxies `/api` requests to the backend server.

## Database setup

Temporary .env setup:
create '.env' file
fill with:
DB_HOST='host name'
DB_PORT='port'
DB_USER='user name'
DB_PASSWORD='password'
DB_NAME='DB name'
SESSION_SECRET='random long string'

## Deploy to AWS

The whole app (Express API on `/api/*`, React build on everything else) is one
Serverless stack defined in `serverless.yml`. New endpoints go in `index.js`.

```bash
set -a && source backend/.env && set +a && npm run deploy
```

Live at https://pqo7vj4gc4.execute-api.us-east-2.amazonaws.com/
