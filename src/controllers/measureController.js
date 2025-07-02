import FHIRClient from "../services/fhirClient.js";
import MeasureService from "../services/measureService.js";

class MeasureController {
  constructor() {
    console.log("MeasureController constructor");
    // Don't create FHIRClient here - do it lazily
    this.measureService = new MeasureService();
  }

  // Lazy initialization - create FHIRClient when needed
  getFHIRClient() {
    if (!this.fhirClient) {
      console.log(
        "Creating FHIRClient with URL:",
        process.env.HAPI_FHIR_BASE_URL
      );
      this.fhirClient = new FHIRClient(process.env.HAPI_FHIR_BASE_URL);
    }
    return this.fhirClient;
  }

  async evaluateMeasure(req, res) {
    try {
      const { measureId } = req.params;
      const {
        patientIds,
        measurementPeriodStart,
        measurementPeriodEnd,
        options = {},
      } = req.body;

      console.log("Request body:", req.body);
      console.log("Extracted patientIds:", patientIds);

      // Use the lazy getter instead of this.fhirClient
      const fhirClient = this.getFHIRClient();

      // Fetch data from HAPI FHIR
      const [measureBundle, patientBundles] = await Promise.all([
        fhirClient.fetchMeasureBundle(measureId),
        fhirClient.fetchPatientBundles(
          patientIds,
          measurementPeriodStart,
          measurementPeriodEnd
        ),
      ]);

      // Extract and decode ELM from the bundle we already have
      const elmDefinition = this.extractElmFromBundle(measureBundle);

      // Calculate using fqm-execution
      const results = await this.measureService.calculateMeasureResults(
        measureBundle,
        patientBundles,
        {
          measurementPeriodStart,
          measurementPeriodEnd,
          ...options,
        }
      );

      res.json(...results, elmDefinition);
    } catch (error) {
      console.error("Measure evaluation error:", error);
      res.status(500).json({
        error: "Measure evaluation failed",
        message: error.message,
      });
    }
  }

  async getGapsInCare(req, res) {
    try {
      const { measureId } = req.params;
      const { patientIds, measurementPeriodStart, measurementPeriodEnd } =
        req.body;

      const fhirClient = this.getFHIRClient();

      const [measureBundle, patientBundles] = await Promise.all([
        fhirClient.fetchMeasureBundle(measureId),
        fhirClient.fetchPatientBundles(
          patientIds,
          measurementPeriodStart,
          measurementPeriodEnd
        ),
      ]);

      // Add the same calculation options that fixed /evaluate
      const calculationOptions = {
        measurementPeriodStart,
        measurementPeriodEnd,
        calculateHTML: false,
        calculateClauseCoverage: false,
        buildStatementLevelHTML: false,
        // Add any other options you used for evaluateMeasure
      };

      const gapsResults = await this.measureService.calculateGapsInCare(
        measureBundle,
        patientBundles,
        calculationOptions // Use the expanded options instead of just the period
      );

      res.json(gapsResults);
    } catch (error) {
      console.error("Gaps in care error:", error);
      res.status(500).json({
        error: "Gaps in care calculation failed",
        message: error.message,
      });
    }
  }

  async getDataRequirements(req, res) {
    try {
      const { measureId } = req.params;

      const fhirClient = this.getFHIRClient();
      const measureBundle = await fhirClient.fetchMeasureBundle(measureId);
      const dataRequirements =
        await this.measureService.calculateDataRequirements(measureBundle);

      res.json(dataRequirements);
    } catch (error) {
      console.error("Data requirements error:", error);
      res.status(500).json({
        error: "Data requirements calculation failed",
        message: error.message,
      });
    }
  }

  async exportMeasureBundle(req, res) {
    try {
      const { measureId } = req.params;
      const fhirClient = this.getFHIRClient();
      const measureBundle = await fhirClient.fetchMeasureBundle(measureId);

      res.json(measureBundle);
    } catch (error) {
      console.error("Export bundle error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default MeasureController;
