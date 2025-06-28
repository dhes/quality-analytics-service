import axios from "axios";

class FHIRClient {
  constructor(baseUrl) {
    console.log("FHIRClient constructor - baseUrl:", baseUrl);
    console.log(
      "process.env.HAPI_FHIR_BASE_URL:",
      process.env.HAPI_FHIR_BASE_URL
    );

    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Accept: "application/fhir+json",
        "Content-Type": "application/fhir+json",
      },
      timeout: 30000,
    });

    console.log(
      "Axios client created with baseURL:",
      this.client.defaults.baseURL
    );
  }

  extractValueSetReferences(measure, libraries) {
    const valueSetUrls = new Set();

    // From Measure.relatedArtifact
    measure.relatedArtifact?.forEach((artifact) => {
      if (
        artifact.type === "depends-on" &&
        artifact.resource?.includes("ValueSet")
      ) {
        valueSetUrls.add(artifact.resource);
      }
    });

    // From Measure.dataRequirement
    measure.dataRequirement?.forEach((req) => {
      req.codeFilter?.forEach((filter) => {
        if (filter.valueSet) {
          valueSetUrls.add(filter.valueSet);
        }
      });
    });

    // From Library resources
    libraries.forEach((library) => {
      library.relatedArtifact?.forEach((artifact) => {
        if (
          artifact.type === "depends-on" &&
          artifact.resource?.includes("ValueSet")
        ) {
          valueSetUrls.add(artifact.resource);
        }
      });

      library.dataRequirement?.forEach((req) => {
        req.codeFilter?.forEach((filter) => {
          if (filter.valueSet) {
            valueSetUrls.add(filter.valueSet);
          }
        });
      });
    });

    console.log(`Extracted ${valueSetUrls.size} unique ValueSet references`);
    return Array.from(valueSetUrls);
  }

  async fetchValueSetFromLocal(valueSetUrl) {
    try {
      // Search by canonical URL
      const response = await this.client.get(
        `/ValueSet?url=${encodeURIComponent(valueSetUrl)}`
      );

      if (response.data.total > 0) {
        return response.data.entry[0].resource;
      }

      // Fallback: try extracting ID from URL and fetching directly
      const possibleId = valueSetUrl.split("/").pop();
      const directResponse = await this.client.get(`/ValueSet/${possibleId}`);
      return directResponse.data;
    } catch (error) {
      console.warn(`Could not fetch ValueSet ${valueSetUrl}:`, error.message);
      return null;
    }
  }

  async gatherValueSets(measure, libraries) {
    const valueSetUrls = this.extractValueSetReferences(measure, libraries);

    console.log(
      `Fetching ${valueSetUrls.length} ValueSets for this measure...`
    );

    // Batch fetch with concurrency control
    const batchSize = 10;
    const valueSets = [];

    for (let i = 0; i < valueSetUrls.length; i += batchSize) {
      const batch = valueSetUrls.slice(i, i + batchSize);
      const batchPromises = batch.map((url) =>
        this.fetchValueSetFromLocal(url)
      );
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value) {
          valueSets.push(result.value);
        } else {
          console.warn(`Failed to fetch ValueSet: ${batch[index]}`);
        }
      });

      console.log(
        `Fetched batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
          valueSetUrls.length / batchSize
        )}`
      );
    }

    console.log(
      `✅ Successfully fetched ${valueSets.length}/${valueSetUrls.length} ValueSets`
    );
    return valueSets;
  }

  // Update your existing fetchMeasureBundle method to use these:
  async fetchMeasureBundle(measureId) {
    try {
      console.log(`Fetching complete measure bundle for: ${measureId}`);

      // 1. Get the Measure resource
      const measureResponse = await this.client.get(`/Measure/${measureId}`);
      const measure = measureResponse.data;

      if (measure.resourceType === "OperationOutcome") {
        const issues = measure.issue || [];
        const errorMessage = issues
          .map((issue) => issue.diagnostics)
          .join("; ");
        throw new Error(`Measure not found: ${errorMessage}`);
      }

      // 2. Start building the bundle
      const bundleEntries = [{ resource: measure }];

      // 3. Get referenced Libraries recursively
      const libraries = [];
      const processedLibraries = new Set(); // Prevent infinite loops

      const fetchLibraryAndDependencies = async (libraryRef) => {
        // Use the full URL without version for search
        const searchUrl = libraryRef.split("|")[0]; // Remove version if present
        const libraryName = searchUrl.split("/").pop(); // Extract name for logging

        // Skip if already processed
        if (processedLibraries.has(searchUrl)) {
          return;
        }
        processedLibraries.add(searchUrl);

        try {
          console.log(`Fetching library: ${libraryName} (URL: ${searchUrl})`);

          const searchResponse = await this.client.get(
            `/Library?url=${encodeURIComponent(searchUrl)}`
          );

          if (searchResponse.data.total === 0) {
            throw new Error(`Library not found: ${searchUrl}`);
          }

          const library = searchResponse.data.entry[0].resource;
          libraries.push(library);
          bundleEntries.push({ resource: library });

          console.log(
            `✅ Successfully fetched library: ${library.id} (${library.name})`
          );

          // Recursively fetch library dependencies
          if (library.relatedArtifact) {
            const libraryDeps = library.relatedArtifact.filter(
              (artifact) =>
                artifact.type === "depends-on" &&
                artifact.resource?.includes("Library")
            );

            if (libraryDeps.length > 0) {
              console.log(
                `  - Found ${libraryDeps.length} library dependencies`
              );

              for (const dep of libraryDeps) {
                await fetchLibraryAndDependencies(dep.resource);
              }
            }
          }
        } catch (libError) {
          console.warn(
            `❌ Could not fetch library ${libraryName}:`,
            libError.message
          );
          // Don't throw - continue with other libraries
        }
      };

      // Start with the main measure libraries
      if (measure.library && measure.library.length > 0) {
        for (const libraryRef of measure.library) {
          await fetchLibraryAndDependencies(libraryRef);
        }
      }
      // 4. Get all required ValueSets
      const valueSets = await this.gatherValueSets(measure, libraries);
      valueSets.forEach((vs) => bundleEntries.push({ resource: vs }));

      // 5. Return complete bundle
      const bundle = {
        resourceType: "Bundle",
        type: "collection",
        entry: bundleEntries,
      };

      console.log(`✅ Created complete bundle with ${bundleEntries.length} resources:
        - 1 Measure
        - ${libraries.length} Libraries  
        - ${valueSets.length} ValueSets`);
      // Right before the return statement in fetchMeasureBundle:
      // const fs = require("fs");
      // fs.writeFileSync(
      //   "complete-measure-bundle.json",
      //   JSON.stringify(bundle, null, 2)
      // );
      // console.log(
      //   "✅ Complete bundle exported to complete-measure-bundle.json"
      // );
      // In fetchMeasureBundle, right before return:
      console.log("=== COMPLETE BUNDLE START ===");
      console.log(JSON.stringify(bundle, null, 2));
      console.log("=== COMPLETE BUNDLE END ===");

      return bundle;
    } catch (error) {
      console.error("Error fetching measure bundle:", error.message);
      if (error.response?.data?.resourceType === "OperationOutcome") {
        const issues = error.response.data.issue || [];
        const errorMessage = issues
          .map((issue) => issue.diagnostics)
          .join("; ");
        throw new Error(`Measure not found: ${errorMessage}`);
      }
      throw new Error(`Failed to fetch measure ${measureId}: ${error.message}`);
    }
  }
  async fetchPatientBundle(
    patientId,
    measurementPeriodStart,
    measurementPeriodEnd
  ) {
    try {
      // Fetch patient data within measurement period
      console.log(`Fetching patient data for: ${patientId}`);
      const params = new URLSearchParams({
        _include: "*",
        _revinclude: "*",
      });

      if (measurementPeriodStart && measurementPeriodEnd) {
        params.append("date", `ge${measurementPeriodStart}`);
        params.append("date", `le${measurementPeriodEnd}`);
      }

      const response = await this.client.get(
        `/Patient/${patientId}/$everything`
      );

      // const url = `/Patient/${patientId}/\\$everything`;
      // console.log("Full URL:", url);
      // console.log("Base URL:", this.client.baseURL);
      // const response = await this.client.get(url);

      // Add this debugging:
      console.log(`Patient bundle for ${patientId}:`);
      console.log(`  - Bundle type: ${response.data.resourceType}`);
      console.log(`  - Total entries: ${response.data.entry?.length || 0}`);

      if (response.data.entry?.length > 0) {
        const resourceTypes = response.data.entry.map(
          (e) => e.resource.resourceType
        );
        const resourceCounts = resourceTypes.reduce((acc, type) => {
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        console.log(`  - Resource counts:`, resourceCounts);

        // Check if Patient resource is first (fqm-execution expects this)
        const firstResource = response.data.entry[0]?.resource;
        console.log(`  - First resource type: ${firstResource?.resourceType}`);

        if (firstResource?.resourceType !== "Patient") {
          console.warn(
            `⚠️  First resource is not Patient! This might cause issues.`
          );
        }
      } else {
        console.log(`  - ⚠️  Empty bundle for patient ${patientId}`);
      }

      return response.data;
    } catch (error) {
      console.error(
        `Error fetching patient bundle for ${patientId}:`,
        error.message
      );
      throw new Error(`Failed to fetch patient ${patientId}: ${error.message}`);
    }
  }

  async fetchPatientBundles(
    patientIds,
    measurementPeriodStart,
    measurementPeriodEnd
  ) {
    const bundles = await Promise.all(
      patientIds.map((id) =>
        this.fetchPatientBundle(
          id,
          measurementPeriodStart,
          measurementPeriodEnd
        )
      )
    );
    return bundles;
  }
}

export default FHIRClient;
