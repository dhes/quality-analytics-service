#!/usr/bin/env node

const fs = require('fs');
const archy = require('archy');

class ElmTreeGenerator {
  constructor(results) {
    this.results = results;
    this.clauseMap = new Map();
    this.elmDefs = new Map();
    this.buildMaps();
  }

  buildMaps() {
    // Build clause results map (localId -> ClauseResult)
    const group1 = this.results.results[0].detailedResults[0];
    group1.clauseResults.forEach(clause => {
      this.clauseMap.set(clause.localId, clause);
    });

    // Build ELM definitions map (localId -> ElmDefinition)
    this.results.elmDefinition.library.statements.def.forEach(def => {
      this.elmDefs.set(def.localId, def);
    });
  }

  generateInitialPopulationTree() {
    // Find Initial Population statement
    const group1 = this.results.results[0].detailedResults[0];
    const initialPopStatement = group1.statementResults.find(
      s => s.statementName === "Initial Population"
    );

    if (!initialPopStatement) {
      return "Initial Population statement not found";
    }

    // Find corresponding ELM definition
    const elmDef = this.elmDefs.get(initialPopStatement.localId);
    if (!elmDef) {
      return "ELM definition not found for Initial Population";
    }

    // Build tree structure for archy
    const treeData = {
      label: this.formatNodeLabel(elmDef.name, elmDef.localId),
      nodes: [this.buildTreeNode(elmDef.expression)]
    };

    // Generate tree with archy
    const tree = archy(treeData);
    
    // Add execution summary
    const summary = this.generateExecutionSummary();
    
    return tree + '\n' + summary;
  }

  buildTreeNode(node, nodeName, nodeLocalId) {
    const localId = nodeLocalId || node.localId;
    const label = this.formatNodeLabel(nodeName || this.getNodeDescription(node), localId);
    
    // Get children
    const children = this.getChildNodes(node);
    
    if (children.length === 0) {
      return { label };
    }

    return {
      label,
      nodes: children.map(child => 
        this.buildTreeNode(child.node, child.name, child.localId)
      )
    };
  }

  formatNodeLabel(nodeName, localId) {
    const clauseResult = localId ? this.clauseMap.get(localId) : null;
    const finalValue = clauseResult?.final;
    const rawValue = clauseResult?.raw;
    
    let label = nodeName;
    if (localId) {
      label += ` (localId: ${localId})`;
    }
    
    if (finalValue) {
      label += this.formatFinalValue(finalValue, rawValue);
    }
    
    // Add explanation on new line if available
    const explanation = this.getNodeExplanation(nodeName, clauseResult);
    if (explanation) {
      label += `\n    ${explanation}`;
    }
    
    return label;
  }

  getChildNodes(node) {
    const children = [];
    
    switch (node.type) {
      case "And":
      case "Or":
        if (Array.isArray(node.operand)) {
          node.operand.forEach(operand => {
            children.push({ node: operand });
          });
        }
        break;
        
      case "GreaterOrEqual":
      case "Equal":
      case "Less":
        if (Array.isArray(node.operand)) {
          node.operand.forEach(operand => {
            children.push({ node: operand });
          });
        }
        break;
        
      case "CalculateAgeAt":
      case "Count":
      case "Exists":
      case "DateFrom":
      case "Start":
        if (node.operand) {
          if (Array.isArray(node.operand)) {
            node.operand.forEach(op => children.push({ node: op }));
          } else {
            children.push({ node: node.operand });
          }
        }
        if (node.source) {
          children.push({ node: node.source });
        }
        break;
        
      case "Property":
        if (node.source) {
          children.push({ node: node.source });
        }
        break;
    }
    
    return children;
  }

  getNodeDescription(node) {
    switch (node.type) {
      case "And": return "AND";
      case "Or": return "OR";
      case "GreaterOrEqual": return "GreaterOrEqual";
      case "Equal": return "Equal";
      case "CalculateAgeAt": return `CalculateAgeAt${node.precision ? ` [${node.precision}]` : ''}`;
      case "Count": return "Count";
      case "Exists": return "Exists";
      case "DateFrom": return "DateFrom";
      case "Start": return "Start";
      case "Property": return `Property "${node.path}"`;
      case "ExpressionRef": return `ExpressionRef "${node.name}"`;
      case "ParameterRef": return `ParameterRef "${node.name}"`;
      case "Literal": return `Literal "${node.value}"`;
      default: return node.type;
    }
  }

  getNodeExplanation(nodeType, clauseResult) {
    if (!clauseResult) return "";
    
    // Extract type from description if it's a composite string
    const type = nodeType.includes("AND") ? "And" : 
                 nodeType.includes("OR") ? "Or" :
                 nodeType.includes("GreaterOrEqual") ? "GreaterOrEqual" :
                 nodeType.includes("CalculateAgeAt") ? "CalculateAgeAt" :
                 nodeType.includes("Count") ? "Count" :
                 nodeType.includes("ExpressionRef") ? "ExpressionRef" :
                 "";
    
    switch (type) {
      case "And":
        return clauseResult.final === "FALSE" 
          ? "[FAILURE: One or more AND conditions failed]"
          : "[All AND conditions passed]";
          
      case "Or":
        return clauseResult.final === "FALSE"
          ? "[FAILURE: All OR conditions failed]"
          : "[At least one OR condition passed]";
          
      case "GreaterOrEqual":
        if (typeof clauseResult.raw === 'boolean') {
          return `[${clauseResult.raw ? 'PASSED' : 'FAILED'}: Comparison result]`;
        }
        return "";
        
      case "CalculateAgeAt":
        if (typeof clauseResult.raw === 'number') {
          return `[Calculated age: ${clauseResult.raw} years]`;
        }
        return "";
        
      case "Count":
        if (typeof clauseResult.raw === 'number') {
          return `[Count result: ${clauseResult.raw}]`;
        }
        return "";
        
      case "ExpressionRef":
        if (Array.isArray(clauseResult.raw) && clauseResult.raw.length === 0) {
          return "[Returns: empty list []]";
        }
        return "";
        
      default:
        return "";
    }
  }

  formatFinalValue(finalValue, rawValue) {
    const icon = finalValue === "TRUE" ? " ✅" : finalValue === "FALSE" ? " ❌" : "";
    let valueDisplay = ` → ${finalValue}${icon}`;
    
    if (rawValue !== undefined && rawValue !== null && finalValue === "TRUE") {
      if (typeof rawValue === 'number' || typeof rawValue === 'string') {
        valueDisplay += ` (value: ${rawValue})`;
      }
    }
    
    return valueDisplay;
  }

  generateExecutionSummary() {
    const group1 = this.results.results[0].detailedResults[0];
    const initialPopResult = group1.statementResults.find(s => s.statementName === "Initial Population");
    
    if (initialPopResult?.final === "FALSE") {
      return `EXECUTION SUMMARY:
❌ Initial Population = FALSE

FAILURE ANALYSIS:
To qualify for Initial Population, patient needs:
  - Age ≥ 12 years at start of measurement period
  - AND either ≥2 qualifying visits OR ≥1 preventive visit during measurement period

REMEDY: Schedule qualifying healthcare encounters during the measurement period`;
    } else {
      return `EXECUTION SUMMARY:
✅ Initial Population = TRUE
Patient meets all Initial Population criteria`;
    }
  }
}

// Command line interface
function main() {
  const args = process.argv.slice(2);
  const filePath = args[0] || 'scratch/results.json';
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: elm-tree-generator [file-path]

Generate ELM expression tree from FQM execution results.

Arguments:
  file-path    Path to results.json file (default: scratch/results.json)

Options:
  -h, --help   Show this help message

Dependencies:
  npm install archy

Example:
  elm-tree-generator scratch/results.json
  elm-tree-generator /path/to/my-results.json
`);
    process.exit(0);
  }

  try {
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const results = JSON.parse(fileContent);
    
    const generator = new ElmTreeGenerator(results);
    const tree = generator.generateInitialPopulationTree();
    
    console.log(tree);
    
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}