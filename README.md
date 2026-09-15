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

Copy `.env.example` to `.env` and fill in the MySQL connection values. The API expects a `users` table with these columns: `user_id`, `email`, `password_hash`, `role`, `first_name`, `last_name`, and `created_at`. Make `email` unique. Passwords are hashed with bcrypt before insertion, and login state uses an HTTP-only session cookie.

