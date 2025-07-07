#!/usr/bin/env node

/**
 * QAS Markdown Report Generator
 * 
 * Reads FQM execution results from QAS and generates focused markdown reports
 * 
 * Usage: node scripts/generate-markdown-report.js
 * Input: scratch/results.json
 * Output: scratch/results.md
 */

const fs = require('fs');
const path = require('path');

// Helper functions for result analysis
const FinalResult = {
  NA: 'NA',
  UNHIT: 'UNHIT', 
  TRUE: 'TRUE',
  FALSE: 'FALSE'
};

const Relevance = {
  NA: 'NA',
  TRUE: 'TRUE',
  FALSE: 'FALSE'
};

/**
 * Generate markdown report from QAS results
 */
function generateMarkdownReport(qasResults) {
  const timestamp = new Date().toISOString();
  const patientResult = qasResults.results[0]; // Assuming single patient for now
  const detailedResult = patientResult.detailedResults[0]; // Assuming single group
  
  const patientId = patientResult.patientId;
  const groupId = detailedResult.groupId;
  
  // Extract ELM definitions for detailed clause analysis
  const elmDefinitions = qasResults.elmDefinitions || qasResults.elmDefinition || null;
  
  // Analyze the data
  const executiveSummary = generateExecutiveSummary(patientResult, detailedResult);
  const populationAnalysis = generatePopulationAnalysis(detailedResult);
  const statementAnalysis = generateStatementAnalysis(detailedResult, elmDefinitions);
  const coverageDetails = generateCoverageDetails(detailedResult, elmDefinitions);
  
  return `# 🔍 CQL Execution Analysis Report

**Generated**: ${timestamp}  
**Patient**: \`${patientId}\`  
**Group**: ${groupId}

---

${executiveSummary}

---

${populationAnalysis}

---

${statementAnalysis}

---

${coverageDetails}

---

*Report generated from QAS FQM execution results*
`;
}

/**
 * Generate Executive Summary section
 */
function generateExecutiveSummary(patientResult, detailedResult) {
  const stats = calculateOverallStats(detailedResult);
  const included = detailedResult.populationResults?.some(p => p.result) || false;
  
  return `## 📊 Executive Summary

| Metric | Value |
|--------|-------|
| **Clause Results** | ✅ ${stats.hitTrueClauses} true, ❌ ${stats.hitFalseClauses} false, ⚪ ${stats.unhitClauses} unhit |
| **Coverage Percentage** | ${stats.coveragePercentage}% (${stats.hitTrueClauses}/${stats.totalClauses} clauses) |
| **Population Result** | ${included ? '✅ INCLUDED' : '❌ EXCLUDED'} |
| **Statements Evaluated** | ${stats.evaluatedStatements} |
| **Functions Skipped** | ${stats.skippedFunctions} |`;
}

/**
 * Generate Population Analysis section
 */
function generatePopulationAnalysis(detailedResult) {
  if (!detailedResult.populationResults || detailedResult.populationResults.length === 0) {
    return `## 🎯 Population Analysis

*No population results available*`;
  }

  const populationTable = detailedResult.populationResults.map(pop => {
    const coverage = calculatePopulationCoverage(pop, detailedResult.clauseResults);
    const reason = getPopulationReason(pop, detailedResult.clauseResults);
    const coverageDisplay = coverage.total > 0 ? 
      `✅${coverage.hitTrue} ❌${coverage.hitFalse} ⚪${coverage.unhit}` : 
      'No data';
    
    return `| ${getPopulationDisplayName(pop.populationType)} | ${pop.result ? '✅ TRUE' : '❌ FALSE'} | ${coverageDisplay} | ${reason} |`;
  }).join('\n');

  return `## 🎯 Population Analysis

| Population | Result | Clause Results | Reason |
|------------|--------|----------------|---------|
${populationTable}`;
}

/**
 * Generate Statement-by-Statement Analysis section
 */
function generateStatementAnalysis(detailedResult, elmDefinitions) {
  if (!detailedResult.statementResults || detailedResult.statementResults.length === 0) {
    return `## 📋 Statement-by-Statement Analysis

*No statement results available*`;
  }

  // Filter to relevant statements only
  const relevantStatements = detailedResult.statementResults.filter(s => 
    s.relevance !== 'NA' && !s.isFunction
  );

  if (relevantStatements.length === 0) {
    return `## 📋 Statement-by-Statement Analysis

*No relevant statements found*`;
  }

  const statementSections = relevantStatements.map(stmt => {
    const resultIcon = getResultIcon(stmt.final);
    const relatedClauses = getRelatedClauses(stmt, detailedResult.clauseResults);
    const clauseBreakdown = generateDetailedClauseBreakdown(relatedClauses, stmt, elmDefinitions);
    
    return `### ${resultIcon} ${stmt.statementName}
**Library**: ${stmt.libraryName}  
**Result**: ${stmt.final}${stmt.raw !== undefined ? ` (\`${formatRawValue(stmt.raw)}\`)` : ''}  
**Relevance**: ${stmt.relevance}

${clauseBreakdown}`;
  }).join('\n\n');

  return `## 📋 Statement-by-Statement Analysis

${statementSections}`;
}

/**
 * Generate Coverage Details section
 */
function generateCoverageDetails(detailedResult, elmDefinitions) {
  if (!detailedResult.clauseResults || detailedResult.clauseResults.length === 0) {
    return `## 🔍 Coverage Details

*No clause results available*`;
  }

  const allClauses = detailedResult.clauseResults;
  
  // Categorize into three types
  const hitTrueClauses = allClauses.filter(c => c.final === FinalResult.TRUE);
  const hitFalseClauses = allClauses.filter(c => c.final === FinalResult.FALSE);
  const unhitClauses = allClauses.filter(c => c.final === FinalResult.UNHIT);

  // Show ALL clauses (no limits)
  const hitTrueList = hitTrueClauses.length > 0 ? 
    hitTrueClauses.map(c => {
      const statementDescription = c.statementName ? `${c.statementName}` : 'Unknown Statement';
      // Try to get more detailed CQL text if available
      const elmStatement = findElmStatement(c.libraryName, c.statementName, elmDefinitions);
      const cqlText = extractCqlTextForClause(c.localId, elmStatement);
      const description = cqlText ? `"${cqlText}"` : statementDescription;
      
      return `- \`${c.localId}\`: ${description} → \`${formatRawValue(c.raw)}\``;
    }).join('\n') :
    '_(None)_';

  const hitFalseList = hitFalseClauses.length > 0 ?
    hitFalseClauses.map(c => {
      const statementDescription = c.statementName ? `${c.statementName}` : 'Unknown Statement';
      // Try to get more detailed CQL text if available
      const elmStatement = findElmStatement(c.libraryName, c.statementName, elmDefinitions);
      const cqlText = extractCqlTextForClause(c.localId, elmStatement);
      const description = cqlText ? `"${cqlText}"` : statementDescription;
      
      return `- \`${c.localId}\`: ${description} → \`${formatRawValue(c.raw)}\``;
    }).join('\n') :
    '_(None)_';

  const unhitList = unhitClauses.length > 0 ?
    unhitClauses.map(c => {
      const statementDescription = c.statementName ? `${c.statementName}` : 'Unknown Statement';
      // Try to get more detailed CQL text if available
      const elmStatement = findElmStatement(c.libraryName, c.statementName, elmDefinitions);
      const cqlText = extractCqlTextForClause(c.localId, elmStatement);
      const description = cqlText ? `"${cqlText}"` : statementDescription;
      
      return `- \`${c.localId}\`: ${description}`;
    }).join('\n') :
    '_(None)_';

  return `## 🔍 Coverage Details

### ✅ HIT/True Clauses (${hitTrueClauses.length})
${hitTrueList}

### ❌ HIT/False Clauses (${hitFalseClauses.length})
${hitFalseList}

### ⚪ UNHIT Clauses (${unhitClauses.length})
${unhitList}`;
}

// Helper functions

function calculateOverallStats(detailedResult) {
  const allClauses = detailedResult.clauseResults || [];
  const allStatements = detailedResult.statementResults || [];
  
  // Three-category breakdown
  const hitTrueClauses = allClauses.filter(c => c.final === FinalResult.TRUE).length;
  const hitFalseClauses = allClauses.filter(c => c.final === FinalResult.FALSE).length;
  const unhitClauses = allClauses.filter(c => c.final === FinalResult.UNHIT).length;
  const totalClauses = allClauses.length;
  
  // Traditional coverage percentage (for backward compatibility)
  const coveragePercentage = totalClauses > 0 ? Math.round((hitTrueClauses / totalClauses) * 100) : 0;
  
  const evaluatedStatements = allStatements.filter(s => s.relevance !== 'NA' && !s.isFunction).length;
  const skippedFunctions = allStatements.filter(s => s.relevance === 'NA' || s.isFunction).length;

  return {
    totalClauses,
    hitTrueClauses,
    hitFalseClauses,
    unhitClauses,
    coveragePercentage, // Keep for backward compatibility
    evaluatedStatements,
    skippedFunctions
  };
}

function calculatePopulationCoverage(population, clauseResults) {
  if (!clauseResults) return { percentage: 0, hitTrue: 0, hitFalse: 0, unhit: 0, total: 0 };
  
  const relatedClauses = clauseResults.filter(c => c.statementName === population.criteriaExpression);
  const hitTrueClauses = relatedClauses.filter(c => c.final === FinalResult.TRUE).length;
  const hitFalseClauses = relatedClauses.filter(c => c.final === FinalResult.FALSE).length;
  const unhitClauses = relatedClauses.filter(c => c.final === FinalResult.UNHIT).length;
  const totalClauses = relatedClauses.length;
  const percentage = totalClauses > 0 ? Math.round((hitTrueClauses / totalClauses) * 100) : 0;
  
  return { 
    percentage, 
    hitTrue: hitTrueClauses, 
    hitFalse: hitFalseClauses, 
    unhit: unhitClauses, 
    total: totalClauses 
  };
}

function getPopulationReason(population, clauseResults) {
  if (population.result) return 'Criteria met';
  
  if (!clauseResults) return 'Criteria not met';
  
  const relatedClauses = clauseResults.filter(c => c.statementName === population.criteriaExpression);
  const failedClauses = relatedClauses.filter(c => c.final === FinalResult.FALSE);
  
  if (failedClauses.length > 0) {
    return `Failed ${failedClauses.length} condition(s)`;
  }
  
  return 'Criteria not met';
}

function getPopulationDisplayName(type) {
  const displayNames = {
    'initial-population': 'Initial Population',
    'denominator': 'Denominator', 
    'numerator': 'Numerator',
    'denominator-exclusion': 'Denominator Exclusion',
    'numerator-exclusion': 'Numerator Exclusion',
    'measure-population': 'Measure Population'
  };
  return displayNames[type] || type;
}

function getResultIcon(finalResult) {
  switch (finalResult) {
    case FinalResult.TRUE: return '✅';      // HIT/true
    case FinalResult.FALSE: return '❌';     // HIT/false
    case FinalResult.UNHIT: return '⚪';     // UNHIT
    case FinalResult.NA: return '❓';        // Not applicable
    default: return '❓';                    // Unknown
  }
}

function getRelatedClauses(statement, clauseResults) {
  if (!clauseResults) return [];
  
  return clauseResults.filter(c => 
    c.statementName === statement.statementName && 
    c.libraryName === statement.libraryName
  );
}

function generateDetailedClauseBreakdown(clauses, statement, elmDefinitions) {
  if (!clauses || clauses.length === 0) {
    return '*No clause details available*';
  }

  // Categorize clauses into three types
  const hitTrueClauses = clauses.filter(c => c.final === FinalResult.TRUE);
  const hitFalseClauses = clauses.filter(c => c.final === FinalResult.FALSE);
  const unhitClauses = clauses.filter(c => c.final === FinalResult.UNHIT);
  
  // Get the ELM statement definition for detailed annotations
  const elmStatement = findElmStatement(statement.libraryName, statement.statementName, elmDefinitions);
  
  // Show ALL clauses (no limit)
  const clauseList = clauses.map(c => {
    const icon = getResultIcon(c.final);
    const cqlText = extractCqlTextForClause(c.localId, elmStatement);
    const contextText = cqlText ? `"${cqlText}"` : c.statementName;
    
    return `- ${icon} \`${c.localId}\`: ${contextText} → ${c.final} (\`${formatRawValue(c.raw)}\`)`;
  }).join('\n');

  // If we have CQL text, also show the full statement
  const fullCqlText = extractFullCqlStatement(elmStatement);
  const cqlDisplay = fullCqlText ? `

**CQL Definition:**
\`\`\`cql
${fullCqlText}
\`\`\`` : '';

  return `**Clause Breakdown** (${hitTrueClauses.length} true, ${hitFalseClauses.length} false, ${unhitClauses.length} unhit):
${clauseList}${cqlDisplay}`;
}

/**
 * Find ELM statement definition in the ELM definitions
 */
function findElmStatement(libraryName, statementName, elmDefinitions) {
  if (!elmDefinitions || !elmDefinitions.library) return null;
  
  // Check if this library matches
  if (elmDefinitions.library.identifier?.id !== libraryName) return null;
  
  // Find the statement in the definitions
  const statements = elmDefinitions.library.statements?.def || [];
  return statements.find(stmt => stmt.name === statementName);
}

/**
 * Extract CQL text for a specific clause (localId) from ELM annotations
 */
function extractCqlTextForClause(localId, elmStatement) {
  if (!elmStatement?.annotation?.[0]?.s) return null;
  
  try {
    // Recursively search the annotation structure for the localId
    const foundText = searchAnnotationForLocalId(elmStatement.annotation[0].s, localId);
    return foundText ? foundText.trim() : null;
  } catch (error) {
    return null;
  }
}

/**
 * Recursively search annotation structure for a specific localId
 */
function searchAnnotationForLocalId(annotationNode, targetLocalId) {
  if (!annotationNode) return null;
  
  // Check if this node has the target localId
  if (annotationNode.r === targetLocalId) {
    return extractTextFromAnnotationNode(annotationNode);
  }
  
  // Search in children
  if (annotationNode.s && Array.isArray(annotationNode.s)) {
    for (const child of annotationNode.s) {
      const result = searchAnnotationForLocalId(child, targetLocalId);
      if (result) return result;
    }
  }
  
  return null;
}

/**
 * Extract readable text from an annotation node
 */
function extractTextFromAnnotationNode(node) {
  if (!node) return '';
  
  let text = '';
  
  // Handle direct value arrays
  if (node.value && Array.isArray(node.value)) {
    text += node.value.join('');
  }
  
  // Handle nested structure
  if (node.s && Array.isArray(node.s)) {
    for (const child of node.s) {
      if (child.value && Array.isArray(child.value)) {
        text += child.value.join('');
      } else if (child.s) {
        text += extractTextFromAnnotationNode(child);
      }
    }
  }
  
  return text;
}

/**
 * Extract the full CQL statement text from ELM annotations
 */
function extractFullCqlStatement(elmStatement) {
  if (!elmStatement?.annotation?.[0]?.s) return null;
  
  try {
    return extractTextFromAnnotationNode(elmStatement.annotation[0]);
  } catch (error) {
    return null;
  }
}

function formatRawValue(raw) {
  if (raw === null || raw === undefined) return 'null';
  if (typeof raw === 'boolean') return raw.toString();
  if (typeof raw === 'number') return raw.toString();
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return `Array(${raw.length})`;
  if (typeof raw === 'object') {
    // Handle common FHIR objects
    if (raw.value !== undefined) return raw.value;
    if (raw.code !== undefined) return raw.code;
    return 'Object';
  }
  return String(raw).substring(0, 50); // Truncate long values
}

/**
 * Main execution function
 */
async function main() {
  const inputPath = path.join(process.cwd(), 'scratch', 'results.json');
  const outputPath = path.join(process.cwd(), 'scratch', 'results.md');

  try {
    console.log('🔍 Reading QAS results...');
    
    // Check if input file exists
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: ${inputPath}`);
    }

    // Read and parse the QAS results
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const qasResults = JSON.parse(rawData);

    console.log('📋 Generating markdown report...');
    
    // Generate the markdown report
    const markdownReport = generateMarkdownReport(qasResults);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Write the report
    fs.writeFileSync(outputPath, markdownReport, 'utf8');

    console.log(`✅ Report generated successfully!`);
    console.log(`📄 Input: ${inputPath}`);
    console.log(`📝 Output: ${outputPath}`);
    console.log(`📊 Size: ${(markdownReport.length / 1024).toFixed(1)} KB`);

  } catch (error) {
    console.error('❌ Error generating report:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. scratch/results.json exists');
    console.error('   2. The JSON file contains valid QAS results');
    console.error('   3. You are running from the QAS project root');
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = {
  generateMarkdownReport,
  generateExecutiveSummary,
  generatePopulationAnalysis,
  generateStatementAnalysis,
  generateCoverageDetails,
  generateDetailedClauseBreakdown,
  extractCqlTextForClause,
  extractFullCqlStatement
};