import serverless from 'serverless-http';
import { app } from './index.js';

// Express app behind API Gateway (HTTP API v2). serverless.yml routes /api/*
// here, so Express sees the same /api/... paths it does locally.
export const handler = serverless(app);
