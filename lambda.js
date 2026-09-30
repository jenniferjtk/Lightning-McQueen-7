import serverless from 'serverless-http';
import { app } from './index.js';

// Express app behind API Gateway (HTTP API v2). Mounted at /express/* while it
// runs alongside the per-route Lambda handlers in backend/; basePath strips that
// prefix so Express sees the same /api/... paths it does locally.
export const handler = serverless(app, { basePath: '/express' });
