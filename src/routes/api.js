import express from 'express';
import MeasureController from '../controllers/measureController.js';

const router = express.Router();
const measureController = new MeasureController();

// Measure evaluation endpoints
router.post('/measures/:measureId/evaluate', measureController.evaluateMeasure.bind(measureController));
router.post('/measures/:measureId/gaps', measureController.getGapsInCare.bind(measureController));
router.get('/measures/:measureId/data-requirements', measureController.getDataRequirements.bind(measureController));
// Add this line with your other routes
router.get('/measures/:measureId/bundle', measureController.exportMeasureBundle.bind(measureController));

export default router;