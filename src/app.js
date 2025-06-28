// src/app.js
import dotenv from 'dotenv';

// Load environment variables FIRST, before anything else
dotenv.config();

// Now import everything else
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 3001;

console.log('Environment loaded - HAPI_FHIR_BASE_URL:', process.env.HAPI_FHIR_BASE_URL);

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large payloads for FHIR bundles
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'quality-analytics' });
});

app.listen(PORT, () => {
  console.log(`Quality Analytics Service running on port ${PORT}`);
});