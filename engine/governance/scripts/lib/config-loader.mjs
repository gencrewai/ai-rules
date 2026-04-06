/**
 * config-loader.mjs — config.yaml loading + preset merge logic
 *
 * - YAML parsing with js-yaml
 * - If preset field exists, load and merge presets/{preset}.yaml
 * - Project config overrides preset (deep merge)
 * - Supports GOVERNANCE_CONFIG_PATH env variable
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** ai-governance project root (2 levels up from scripts/lib/) */
const GOVERNANCE_ROOT = resolve(__dirname, "..", "..");

/** Presets directory */
const PRESETS_DIR = join(GOVERNANCE_ROOT, "presets");

/**
 * Deep merges two objects.
 * Override values overwrite base values.
 *
 * @param {object} base - Base object (preset)
 * @param {object} override - Override object (project config)
 * @returns {object} Merged object
 */
export function deepMerge(base, override) {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    const baseVal = base[key];
    const overVal = override[key];

    if (
      overVal !== null &&
      typeof overVal === "object" &&
      !Array.isArray(overVal) &&
      baseVal !== null &&
      typeof baseVal === "object" &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(baseVal, overVal);
    } else {
      result[key] = overVal;
    }
  }

  return result;
}

/**
 * Reads and parses a YAML file.
 *
 * @param {string} filePath - YAML file path
 * @returns {object} Parsed object
 * @throws {Error} When file is missing or parse fails
 */
export function loadYaml(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(content);

  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Not a valid YAML object: ${filePath}`);
  }

  return parsed;
}

/**
 * Returns list of available presets.
 *
 * @returns {string[]} Preset name array
 */
export function getAvailablePresets() {
  if (!existsSync(PRESETS_DIR)) {
    return [];
  }

  const files = readdirSync(PRESETS_DIR);
  return files
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => f.replace(/\.ya?ml$/, ""));
}

/**
 * Loads preset YAML.
 *
 * @param {string} presetName - Preset name (solo, small-team, etc.)
 * @returns {object} Preset config object
 * @throws {Error} When preset file is missing
 */
export function loadPreset(presetName) {
  const presetPath = join(PRESETS_DIR, `${presetName}.yaml`);

  if (!existsSync(presetPath)) {
    const available = getAvailablePresets();
    throw new Error(
      `Preset '${presetName}' not found.\n` +
        `Available presets: ${available.join(", ") || "(none)"}\n` +
        `Path: ${presetPath}`
    );
  }

  return loadYaml(presetPath);
}

/**
 * Determines the default path for config.yaml.
 *
 * Priority:
 * 1. Explicitly passed path
 * 2. GOVERNANCE_CONFIG_PATH env variable
 * 3. {projectRoot}/.ai-governance/config.yaml
 *
 * @param {string} [projectRoot] - Project root path
 * @param {string} [configPath] - Explicit config path
 * @returns {string} config.yaml absolute path
 */
export function resolveConfigPath(projectRoot, configPath) {
  if (configPath) {
    return resolve(configPath);
  }

  if (process.env.GOVERNANCE_CONFIG_PATH) {
    return resolve(process.env.GOVERNANCE_CONFIG_PATH);
  }

  const root = projectRoot || process.cwd();
  return join(root, ".ai-governance", "config.yaml");
}

/**
 * Loads governance configuration.
 * If a preset is specified, deep merges the project config on top of the preset base.
 *
 * @param {object} options
 * @param {string} [options.projectRoot] - Project root path (default: cwd)
 * @param {string} [options.configPath] - Explicit config.yaml path
 * @returns {{ config: object, configPath: string, presetUsed: string|null }}
 */
export function loadConfig({ projectRoot, configPath } = {}) {
  const resolvedPath = resolveConfigPath(projectRoot, configPath);
  const projectConfig = loadYaml(resolvedPath);

  let presetUsed = null;
  let mergedConfig = projectConfig;

  // If preset field exists, load preset and merge
  if (projectConfig.preset && typeof projectConfig.preset === "string") {
    const presetConfig = loadPreset(projectConfig.preset);
    presetUsed = projectConfig.preset;

    // Preset as base, project config overrides
    mergedConfig = deepMerge(presetConfig, projectConfig);
  }

  return {
    config: mergedConfig,
    configPath: resolvedPath,
    presetUsed,
  };
}
