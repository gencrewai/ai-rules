#!/usr/bin/env node

/**
 * init.mjs — Interactive script to apply governance to existing projects
 *
 * Usage:
 *   node scripts/init.mjs --target <project-path> [--preset <preset>] [--dry-run]
 *
 * Options:
 *   --target   Project root path (required)
 *   --preset   Preset name (solo, small-team, medium-team, large-team)
 *   --dry-run  Print changes only without actually creating files
 *
 * Interactive mode (when --preset is not specified):
 *   1. Select team size
 *   2. Confirm gate settings
 *   3. Whether to copy CI workflows
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline";
import yaml from "js-yaml";
import { getAvailablePresets, loadPreset } from "./lib/config-loader.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** ai-governance project root */
const GOVERNANCE_ROOT = resolve(__dirname, "..");

/** Templates directory */
const TEMPLATES_DIR = join(GOVERNANCE_ROOT, "templates");

/** Presets directory */
const PRESETS_DIR = join(GOVERNANCE_ROOT, "presets");

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    target: { type: "string" },
    preset: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
  strict: false,
});

if (!args.target) {
  console.error("❌ --target option is required.");
  console.error("   Usage: node scripts/init.mjs --target <project-path>");
  process.exit(1);
}

const projectRoot = resolve(args.target);
const dryRun = args["dry-run"];

if (!existsSync(projectRoot)) {
  console.error(`❌ Project path does not exist: ${projectRoot}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * readline-based prompt
 *
 * @param {string} question - Question string
 * @returns {Promise<string>} User input
 */
function prompt(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Numeric selection prompt
 *
 * @param {string} question - Question string
 * @param {string[]} options - Options array
 * @returns {Promise<number>} Selected index (0-based)
 */
async function promptSelect(question, options) {
  console.log(`\n${question}`);
  for (let i = 0; i < options.length; i++) {
    console.log(`  ${i + 1}. ${options[i]}`);
  }

  while (true) {
    const answer = await prompt(`Select (1-${options.length}): `);
    const num = parseInt(answer, 10);

    if (num >= 1 && num <= options.length) {
      return num - 1;
    }

    console.log(`  Please enter a number between 1 and ${options.length}.`);
  }
}

/**
 * Y/N prompt
 *
 * @param {string} question - Question string
 * @param {boolean} [defaultYes=true] - Default value
 * @returns {Promise<boolean>}
 */
async function promptYesNo(question, defaultYes = true) {
  const suffix = defaultYes ? "(Y/n)" : "(y/N)";
  const answer = await prompt(`${question} ${suffix}: `);

  if (answer === "") return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

/**
 * Recursively copies a directory.
 *
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 * @param {string[]} copiedFiles - Array to record copied file paths
 */
function copyDirRecursive(src, dest, copiedFiles) {
  if (!existsSync(src)) return;

  const entries = readdirSync(src);

  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDirRecursive(srcPath, destPath, copiedFiles);
    } else {
      const relPath = relative(projectRoot, destPath);

      if (dryRun) {
        console.log(`  [DRY-RUN] Create: ${relPath}`);
      } else {
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(srcPath, destPath);
        console.log(`  Create: ${relPath}`);
      }

      copiedFiles.push(relPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Main logic
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n${"═".repeat(60)}`);
  console.log("  AI Governance Initialization");
  console.log(`${"═".repeat(60)}`);
  console.log(`\nTarget project: ${projectRoot}`);

  if (dryRun) {
    console.log("Mode: DRY-RUN (no actual file changes)\n");
  }

  // Check if project is already initialized
  const governanceDir = join(projectRoot, ".ai-governance");
  const configPath = join(governanceDir, "config.yaml");

  if (existsSync(configPath)) {
    const overwrite = await promptYesNo(
      "\n⚠️  .ai-governance/config.yaml already exists. Overwrite?",
      false
    );
    if (!overwrite) {
      console.log("\nInitialization cancelled.");
      process.exit(0);
    }
  }

  // -------------------------------------------------------------------------
  // Step 1: Determine preset
  // -------------------------------------------------------------------------

  let selectedPreset = args.preset;
  const availablePresets = getAvailablePresets();

  if (!selectedPreset) {
    // Interactive mode
    const presetOptions = [
      "solo       — Solo developer (Gate 1 only, ~$10-30/mo)",
      "small-team — 2-10 person team (Gate 1+2, ~$50-200/mo)",
      "medium-team — 11-50 person team (All gates, ~$200-500/mo)",
      "large-team — 50+ person org (All gates + hardened, ~$500+/mo)",
    ];

    const presetNames = ["solo", "small-team", "medium-team", "large-team"];
    const idx = await promptSelect("Select team size:", presetOptions);
    selectedPreset = presetNames[idx];
  }

  // Preset validation
  if (!availablePresets.includes(selectedPreset)) {
    console.log(
      `\n⚠️  Preset '${selectedPreset}' does not exist yet.`
    );
    console.log(`   Available: ${availablePresets.join(", ") || "(none)"}`);
    console.log("   Creating basic config only.\n");
  }

  console.log(`\nSelected preset: ${selectedPreset}`);

  // -------------------------------------------------------------------------
  // Step 2: Gate settings confirmation (interactive)
  // -------------------------------------------------------------------------

  let presetConfig = {};
  let usePresetDefaults = true;

  if (availablePresets.includes(selectedPreset)) {
    try {
      presetConfig = loadPreset(selectedPreset);
    } catch {
      console.log(`⚠️  Preset load failed. Proceeding with defaults.`);
    }
  }

  if (!args.preset) {
    // Only confirm gates when preset was not specified via CLI
    console.log("\n── Gate Settings Confirmation ──");

    const gate1 = presetConfig.gates?.gate_1?.enabled ?? true;
    const gate2 = presetConfig.gates?.gate_2?.enabled ?? false;
    const gate3 = presetConfig.gates?.gate_3?.enabled ?? false;

    console.log(`  Gate 1 (Static analysis):   ${gate1 ? "enabled" : "disabled"}`);
    console.log(`  Gate 2 (Confidence eval):   ${gate2 ? "enabled" : "disabled"}`);
    console.log(`  Gate 3 (Cross-verify):      ${gate3 ? "enabled" : "disabled"}`);

    usePresetDefaults = await promptYesNo(
      "\nProceed with the above settings?",
      true
    );

    if (!usePresetDefaults) {
      console.log("\n  Using preset Gate defaults.");
      console.log("  Modify .ai-governance/config.yaml manually after initialization.");
    }
  }

  // -------------------------------------------------------------------------
  // Step 3: Copy files
  // -------------------------------------------------------------------------

  console.log("\n── File Generation ──\n");

  const copiedFiles = [];

  // templates/.ai-governance/ → project/.ai-governance/
  const templateGovernanceDir = join(TEMPLATES_DIR, ".ai-governance");
  copyDirRecursive(templateGovernanceDir, governanceDir, copiedFiles);

  // templates/.ai-context/ → project/.ai-context/ (if exists)
  const templateContextDir = join(TEMPLATES_DIR, ".ai-context");
  if (existsSync(templateContextDir)) {
    const contextDir = join(projectRoot, ".ai-context");
    copyDirRecursive(templateContextDir, contextDir, copiedFiles);
  }

  // Generate config.yaml (set preset field)
  const configContent = generateConfigYaml(selectedPreset, presetConfig);

  if (dryRun) {
    console.log(`  [DRY-RUN] Create: .ai-governance/config.yaml`);
  } else {
    mkdirSync(governanceDir, { recursive: true });
    writeFileSync(configPath, configContent, "utf-8");
    console.log(`  Create: .ai-governance/config.yaml`);
  }
  copiedFiles.push(".ai-governance/config.yaml");

  // -------------------------------------------------------------------------
  // Step 4: CI workflow copy
  // -------------------------------------------------------------------------

  const templateWorkflowDir = join(TEMPLATES_DIR, "github-workflows");
  const hasWorkflowTemplates =
    existsSync(templateWorkflowDir) &&
    readdirSync(templateWorkflowDir).length > 0;

  if (hasWorkflowTemplates) {
    let copyWorkflows = false;

    if (args.preset) {
      // Default to copy in CLI mode
      copyWorkflows = true;
    } else {
      copyWorkflows = await promptYesNo(
        "\nCopy GitHub Actions CI workflows?",
        true
      );
    }

    if (copyWorkflows) {
      const workflowDest = join(projectRoot, ".github", "workflows");
      copyDirRecursive(templateWorkflowDir, workflowDest, copiedFiles);
    }
  }

  // -------------------------------------------------------------------------
  // Result summary
  // -------------------------------------------------------------------------

  console.log(`\n${"═".repeat(60)}`);
  console.log("  Initialization Complete");
  console.log(`${"═".repeat(60)}`);
  console.log(`\nPreset: ${selectedPreset}`);
  console.log(`Files created: ${copiedFiles.length}`);

  if (copiedFiles.length > 0) {
    console.log("");
    for (const f of copiedFiles) {
      console.log(`  - ${f}`);
    }
  }

  console.log("\nNext steps:");
  console.log("  1. Review and modify .ai-governance/config.yaml as needed.");

  if (presetConfig.gates?.gate_2?.enabled) {
    console.log("  2. Set per-domain thresholds in .ai-governance/thresholds.yaml.");
    console.log("  3. Add golden test sets to .ai-governance/golden-set/.");
  }

  if (presetConfig.cross_verification?.enabled) {
    console.log("  4. Configure cross-verification agents in .ai-governance/agents.yaml.");
  }

  console.log(`\nValidation: node ${relative(projectRoot, join(GOVERNANCE_ROOT, "scripts", "validate.mjs"))} --target ${projectRoot}\n`);
}

/**
 * Generates config.yaml content.
 *
 * @param {string} presetName - Preset name
 * @param {object} presetConfig - Preset config (for reference)
 * @returns {string} YAML string
 */
function generateConfigYaml(presetName, presetConfig) {
  const config = {
    version: "1.0",
    preset: presetName,
    release_mode: "NORMAL",
  };

  // If preset exists, only set preset field (rest loaded from preset)
  // If no preset, include minimal defaults
  if (!presetConfig || Object.keys(presetConfig).length === 0) {
    config.gates = {
      gate_1: {
        enabled: true,
        checks: ["tsc --noEmit", "eslint ."],
        required: true,
      },
    };
  }

  const header = [
    "# =============================================================================",
    `# AI Governance Configuration — Preset: ${presetName}`,
    "# =============================================================================",
    `# Generated: ${new Date().toISOString().split("T")[0]}`,
    `# Defaults are applied through the preset.`,
    `# Individual settings can be overridden in this file.`,
    "# =============================================================================",
    "",
  ].join("\n");

  return header + yaml.dump(config, { lineWidth: 120, noRefs: true });
}

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

main().catch((err) => {
  console.error(`\n❌ Error during initialization: ${err.message}`);
  process.exit(1);
});
