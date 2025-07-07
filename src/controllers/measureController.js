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

  // Helper method to extract ELM from measure bundle
  extractElmFromBundle(measureBundle) {
    try {
      // Find all Library resources in the bundle
      const libraries =
        measureBundle.entry?.filter(
          (entry) => entry.resource?.resourceType === "Library"
        ) || [];

      console.log(`Found ${libraries.length} libraries in measure bundle`);

      // Look for the main library (usually matches the measure name)
      // For CMS138, look for library with name containing 'CMS138' or 'PreventiveTobaccoCessation'
      const mainLibrary = libraries.find((entry) => {
        const library = entry.resource;
        return (
          library.name?.includes("CMS138") ||
          library.name?.includes("PreventiveTobaccoCessation") ||
          library.name?.includes("Preventive") ||
          library.title?.includes("CMS138")
        );
      });

      if (!mainLibrary) {
        console.warn("Main library not found, using first library");
        const firstLibrary = libraries[0];
        if (!firstLibrary) {
          throw new Error("No libraries found in measure bundle");
        }
        return this.extractElmFromLibrary(firstLibrary.resource);
      }

      console.log(`Using library: ${mainLibrary.resource.name}`);
      return this.extractElmFromLibrary(mainLibrary.resource);
    } catch (error) {
      console.error("Error extracting ELM from bundle:", error);
      return null; // Return null so enhanced guidance can fall back gracefully
    }
  }

  // Helper method to extract ELM from a specific library resource
  extractElmFromLibrary(library) {
    try {
      // Find the ELM content
      const elmContent = library.content?.find(
        (content) => content.contentType === "application/elm+json"
      );

      if (!elmContent) {
        console.warn("No ELM content found in library", library.name);
        return null;
      }

      if (!elmContent.data) {
        console.warn("ELM content has no data", library.name);
        return null;
      }

      // Base64 decode and parse the ELM JSON
      console.log("Decoding ELM content...");
      const elmJson = JSON.parse(atob(elmContent.data));

      console.log(
        `Successfully extracted ELM for library: ${elmJson.library?.identifier?.id}`
      );
      return elmJson;
    } catch (error) {
      console.error("Error extracting ELM from library:", error);
      return null;
    }
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

      // ADD THIS DEBUG LOG:
      console.log("🔍 Measurement Period Debug:", {
        fromRequest: { measurementPeriodStart, measurementPeriodEnd },
        patientIds: patientIds,
      });

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

      // Extract ELM from the measure bundle
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

      // Include ELM definition in response for enhanced guidance
      res.json({
        ...results,
        elmDefinition, // Add the decoded ELM
      });
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
