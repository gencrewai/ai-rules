#!/usr/bin/env node

/**
 * validate.mjs — Config + schema validation script
 *
 * Usage:
 *   node scripts/validate.mjs [--target <project-path>]
 *
 * Options:
 *   --target  Project root path (default: current directory)
 *
 * Validation items:
 *   1. Check .ai-governance/config.yaml exists
 *   2. JSON Schema-based structure validation
 *   3. Check referenced files exist (thresholds_file, agents_file, etc.)
 */

import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "./lib/config-loader.mjs";
import { validateConfig, formatErrors } from "./lib/schema-validator.mjs";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    target: { type: "string", default: process.cwd() },
  },
  strict: false,
});

const projectRoot = resolve(args.target);
const configPath = join(projectRoot, ".ai-governance", "config.yaml");

// ---------------------------------------------------------------------------
// Validation result collection
// ---------------------------------------------------------------------------

/** @type {Array<{ level: "error"|"warn"|"pass", message: string }>} */
const results = [];

function addPass(message) {
  results.push({ level: "pass", message });
}

function addError(message) {
  results.push({ level: "error", message });
}

function addWarn(message) {
  results.push({ level: "warn", message });
}

// ---------------------------------------------------------------------------
// Step 1: Check config.yaml exists
// ---------------------------------------------------------------------------

console.log(`\nGovernance config validation: ${projectRoot}\n`);
console.log("─".repeat(60));

if (!existsSync(configPath)) {
  addError(`.ai-governance/config.yaml file not found.`);
  printResults();
  process.exit(1);
}

addPass(`.ai-governance/config.yaml file exists`);

// ---------------------------------------------------------------------------
// Step 2: Load config + JSON Schema validation
// ---------------------------------------------------------------------------

let config;
let presetUsed;

try {
  const loaded = loadConfig({ projectRoot });
  config = loaded.config;
  presetUsed = loaded.presetUsed;
  addPass(`config.yaml loaded successfully${presetUsed ? ` (preset: ${presetUsed})` : ""}`);
} catch (err) {
  addError(`config.yaml load failed: ${err.message}`);
  printResults();
  process.exit(1);
}

const { valid, errors } = validateConfig(config);

if (valid) {
  addPass("JSON Schema validation passed");
} else {
  addError(`JSON Schema validation failed:\n${formatErrors(errors)}`);
}

// ---------------------------------------------------------------------------
// Step 3: Check referenced files exist
// ---------------------------------------------------------------------------

/** Referenced file list to check: [config path, description] */
const fileReferences = [];

// Gate 2: thresholds_file, golden_set_path
if (config.gates?.gate_2?.enabled) {
  if (config.gates.gate_2.thresholds_file) {
    fileReferences.push([
      config.gates.gate_2.thresholds_file,
      "Gate 2 thresholds file (thresholds_file)",
    ]);
  }
  if (config.gates.gate_2.golden_set_path) {
    fileReferences.push([
      config.gates.gate_2.golden_set_path,
      "Gate 2 golden set directory (golden_set_path)",
    ]);
  }
}

// Cross-verification: agents_file
if (config.cross_verification?.enabled) {
  if (config.cross_verification.agents_file) {
    fileReferences.push([
      config.cross_verification.agents_file,
      "Cross-verification agent file (agents_file)",
    ]);
  }
}

for (const [refPath, description] of fileReferences) {
  const absolutePath = resolve(projectRoot, refPath);

  if (existsSync(absolutePath)) {
    addPass(`${description}: ${refPath}`);
  } else {
    addWarn(`${description} not found: ${refPath}`);
  }
}

// ---------------------------------------------------------------------------
// Step 4: Additional warning checks
// ---------------------------------------------------------------------------

// version check
if (config.version && config.version !== "1.0") {
  addWarn(`Unsupported config version: ${config.version} (currently supported: 1.0)`);
}

// Warn if release_mode is EMERGENCY
if (config.release_mode === "EMERGENCY") {
  addWarn("release_mode is set to EMERGENCY. Gates are being bypassed.");
}

// Warn if Gate 1 is disabled
if (config.gates?.gate_1?.enabled === false) {
  addWarn("Gate 1 (static analysis) is disabled. Minimum code quality checks are recommended.");
}

// ---------------------------------------------------------------------------
// Output results
// ---------------------------------------------------------------------------

printResults();

function printResults() {
  console.log("");

  const passes = results.filter((r) => r.level === "pass");
  const warnings = results.filter((r) => r.level === "warn");
  const errors = results.filter((r) => r.level === "error");

  for (const r of passes) {
    console.log(`  ✅ ${r.message}`);
  }
  for (const r of warnings) {
    console.log(`  ⚠️  ${r.message}`);
  }
  for (const r of errors) {
    console.log(`  ❌ ${r.message}`);
  }

  console.log("\n" + "─".repeat(60));

  if (errors.length > 0) {
    console.log(
      `\nResult: ❌ ${errors.length} error(s)` +
        (warnings.length > 0 ? `, ⚠️ ${warnings.length} warning(s)` : "") +
        `, ✅ ${passes.length} passed\n`
    );
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log(
      `\nResult: ⚠️ ${warnings.length} warning(s), ✅ ${passes.length} passed\n`
    );
    process.exit(0);
  } else {
    console.log(`\nResult: ✅ All validations passed (${passes.length})\n`);
    process.exit(0);
  }
}
