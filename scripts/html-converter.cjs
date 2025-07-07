#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// HTML template with styling for coverage display
const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FQM Coverage Analysis</title>
    <style>
        body {
            font-family: 'Courier New', monospace;
            line-height: 1.6;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #ddd;
            padding-bottom: 10px;
        }
        h2 {
            color: #666;
            margin-top: 30px;
        }
        pre {
            background-color: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 4px;
            padding: 15px;
            margin: 10px 0;
            overflow-x: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        code {
            font-family: 'Courier New', monospace;
            font-size: 14px;
        }
        /* Coverage highlighting styles */
        span[style*="background-color:#daeaf5"] {
            background-color: #daeaf5 !important;
            color: #004e82 !important;
            border-bottom: 2px dashed #004e82;
            font-weight: bold;
        }
        span[style*="background-color:white"] {
            background-color: white !important;
            color: black !important;
        }
        .coverage-info {
            background-color: #e8f4fd;
            border-left: 4px solid #0066cc;
            padding: 15px;
            margin: 20px 0;
        }
        .legend {
            background-color: #f0f0f0;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .legend-item {
            display: inline-block;
            margin-right: 20px;
            margin-bottom: 5px;
        }
        .legend-covered {
            background-color: #daeaf5;
            color: #004e82;
            padding: 2px 8px;
            border-bottom: 2px dashed #004e82;
            font-weight: bold;
        }
        .legend-uncovered {
            background-color: white;
            color: black;
            padding: 2px 8px;
            border: 1px solid #ccc;
        }
        .input-section {
            margin-bottom: 30px;
            padding: 20px;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
        textarea {
            width: 100%;
            height: 200px;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            background-color: #007bff;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 10px;
        }
        button:hover {
            background-color: #0056b3;
        }
        .timestamp {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>FQM Coverage Analysis Viewer</h1>
        <div class="timestamp">Generated: {{TIMESTAMP}}</div>
        
        <div class="legend">
            <h3>Coverage Legend:</h3>
            <div class="legend-item">
                <span class="legend-covered">Covered</span> - Logic that executed with "truthy" values
            </div>
            <div class="legend-item">
                <span class="legend-uncovered">Uncovered</span> - Logic that was not executed or had "falsy" values
            </div>
        </div>

        <div class="coverage-info">
            <strong>Coverage Analysis:</strong> This view shows which parts of your CQL measure logic were actually executed during calculation. Blue highlighted sections with dashed underlines represent code that was executed and returned "truthy" values.
        </div>

        <div id="coverage-content">
            {{CONTENT}}
        </div>
    </div>
</body>
</html>`;

function convertCoverageHtml(inputContent, outputFile = 'coverage-analysis.html') {
    try {
        // Clean and extract HTML content
        const cleanedContent = extractAndCleanHtml(inputContent);
        
        // Extract coverage percentage if present
        const coverageMatch = cleanedContent.match(/Clause Coverage: ([\d.]+)%/);
        const coveragePercent = coverageMatch ? coverageMatch[1] : 'Unknown';
        
        // Get current timestamp
        const timestamp = new Date().toLocaleString();
        
        // Replace placeholders in template
        const finalHtml = htmlTemplate
            .replace('{{CONTENT}}', cleanedContent)
            .replace('{{TIMESTAMP}}', timestamp);
        
        // Write the file
        fs.writeFileSync(outputFile, finalHtml, 'utf8');
        
        console.log(`✅ Successfully created: ${outputFile}`);
        console.log(`📊 Coverage: ${coveragePercent}%`);
        console.log(`🔍 File size: ${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB`);
        console.log(`🌐 Open in browser: file://${path.resolve(outputFile)}`);
        
        return outputFile;
        
    } catch (error) {
        console.error('❌ Error creating HTML file:', error.message);
        process.exit(1);
    }
}

function extractAndCleanHtml(inputContent) {
    console.log('🔍 Analyzing input format...');
    
    // Try to detect and handle different input formats
    const trimmed = inputContent.trim();
    
    // Case 1: Try parsing as JSON (full API response)
    try {
        const parsed = JSON.parse(trimmed);
        
        // Look for coverage HTML in common locations
        if (parsed.coverageHTML) {
            console.log('📋 Detected: FQM API response with coverageHTML object');
            const groupKeys = Object.keys(parsed.coverageHTML);
            if (groupKeys.length > 0) {
                console.log(`🎯 Using coverage HTML for: ${groupKeys[0]}`);
                return parsed.coverageHTML[groupKeys[0]];
            }
        }
        
        if (parsed.groupClauseCoverageHTML) {
            console.log('📋 Detected: FQM API response with groupClauseCoverageHTML object');
            const groupKeys = Object.keys(parsed.groupClauseCoverageHTML);
            if (groupKeys.length > 0) {
                console.log(`🎯 Using coverage HTML for: ${groupKeys[0]}`);
                return parsed.groupClauseCoverageHTML[groupKeys[0]];
            }
        }
        
        // If it's valid JSON but doesn't contain coverage HTML
        console.log('⚠️  JSON detected but no coverage HTML found');
        return trimmed;
        
    } catch (jsonError) {
        // Not JSON, continue with other methods
    }
    
    // Case 2: JSON-escaped HTML string (like "\"coverageHTML\": {...}")
    if (trimmed.includes('\\"') || trimmed.includes('\\n')) {
        console.log('📋 Detected: JSON-escaped HTML string');
        return trimmed
            .replace(/\\"/g, '"')       // Unescape quotes
            .replace(/\\n/g, '\n')      // Unescape newlines
            .replace(/\\t/g, '\t')      // Unescape tabs
            .replace(/\\r/g, '\r')      // Unescape carriage returns
            .replace(/\\\\/g, '\\');    // Unescape backslashes
    }
    
    // Case 3: Extract from a larger text block (like copy-pasted logs)
    const htmlMatch = trimmed.match(/"coverageHTML":\s*{\s*"[^"]+"\s*:\s*"([^"]+(?:\\.[^"]*)*)"/) || 
                     trimmed.match(/"groupClauseCoverageHTML":\s*{\s*"[^"]+"\s*:\s*"([^"]+(?:\\.[^"]*)*)"/) ||
                     trimmed.match(/<div><h2>.*?<\/div>/s);
    
    if (htmlMatch) {
        console.log('📋 Detected: HTML extracted from larger text block');
        const extracted = htmlMatch[1] || htmlMatch[0];
        return extracted
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\r/g, '\r')
            .replace(/\\\\/g, '\\');
    }
    
    // Case 4: Raw HTML (already clean)
    if (trimmed.includes('<div>') || trimmed.includes('<pre>')) {
        console.log('📋 Detected: Raw HTML (already clean)');
        return trimmed;
    }
    
    // Case 5: Unknown format, return as-is with warning
    console.log('⚠️  Unknown format detected, using as-is');
    console.log('💡 Tip: Input should be JSON from FQM API or raw HTML');
    return trimmed;
}

// Command line interface
function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node html-converter.js <input-file> [output-file]');
        console.log('  node html-converter.js --stdin [output-file]');
        console.log('');
        console.log('Examples:');
        console.log('  node html-converter.js coverage.txt coverage.html');
        console.log('  node html-converter.js --stdin my-coverage.html');
        console.log('  cat coverage.txt | node html-converter.js --stdin');
        process.exit(1);
    }
    
    if (args[0] === '--stdin') {
        // Read from stdin
        let inputContent = '';
        process.stdin.setEncoding('utf8');
        
        process.stdin.on('data', (chunk) => {
            inputContent += chunk;
        });
        
        process.stdin.on('end', () => {
            const outputFile = args[1] || 'coverage-analysis.html';
            convertCoverageHtml(inputContent, outputFile);
        });
        
    } else {
        // Read from file
        const inputFile = args[0];
        const outputFile = args[1] || inputFile.replace(/\.[^.]*$/, '') + '-coverage.html';
        
        if (!fs.existsSync(inputFile)) {
            console.error(`❌ Input file not found: ${inputFile}`);
            process.exit(1);
        }
        
        const inputContent = fs.readFileSync(inputFile, 'utf8');
        convertCoverageHtml(inputContent, outputFile);
    }
}

// Export for use as module
module.exports = { convertCoverageHtml };

// Run if called directly
if (require.main === module) {
    main();
}