import { Calculator } from 'fqm-execution';
import NodeCache from 'node-cache';

class MeasureService {
  constructor() {
    // Cache for 10 minutes
    this.cache = new NodeCache({ stdTTL: 600 });
  }

  async calculateMeasureResults(measureBundle, patientBundles, options = {}) {
    const defaultOptions = {
      calculateHTML: false,
      calculateClauseCoverage: false,
      calculateSDEs: true,
      buildStatementLevelHTML: false,
      verboseCalculationResults: true
    };

    const calculationOptions = { ...defaultOptions, ...options };

    try {
      const { results, groupClauseCoverageHTML } = await Calculator.calculate(
        measureBundle,
        patientBundles,
        calculationOptions
      );

      return {
        results,
        coverageHTML: groupClauseCoverageHTML,
        metadata: {
          calculatedAt: new Date().toISOString(),
          patientCount: patientBundles.length,
          options: calculationOptions
        }
      };
    } catch (error) {
      console.error('Measure calculation error:', error);
      throw new Error(`Measure calculation failed: ${error.message}`);
    }
  }

  async calculateGapsInCare(measureBundle, patientBundles, options = {}) {
    try {
      const { results } = await Calculator.calculateGapsInCare(
        measureBundle,
        patientBundles,
        options
      );

      return {
        gapsResults: results,
        metadata: {
          calculatedAt: new Date().toISOString(),
          patientCount: patientBundles.length
        }
      };
    } catch (error) {
      console.error('Gaps in care calculation error:', error);
      throw new Error(`Gaps in care calculation failed: ${error.message}`);
    }
  }

  async calculateDataRequirements(measureBundle, options = {}) {
    const cacheKey = `data-req-${measureBundle.id || 'unknown'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    try {
      const { results } = await Calculator.calculateDataRequirements(measureBundle, options);
      
      const response = {
        dataRequirements: results,
        metadata: {
          calculatedAt: new Date().toISOString()
        }
      };

      this.cache.set(cacheKey, response);
      return response;
    } catch (error) {
      console.error('Data requirements calculation error:', error);
      throw new Error(`Data requirements calculation failed: ${error.message}`);
    }
  }
}

export default MeasureService;