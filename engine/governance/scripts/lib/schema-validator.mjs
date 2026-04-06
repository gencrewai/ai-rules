/**
 * schema-validator.mjs — JSON Schema-based validation utility
 *
 * - JSON Schema validation with ajv
 * - Load schemas from schemas/ directory
 * - Returns validation results as { valid, errors }
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** ai-governance project root (2 levels up from scripts/lib/) */
const GOVERNANCE_ROOT = resolve(__dirname, "..", "..");

/** Schemas directory */
const SCHEMAS_DIR = join(GOVERNANCE_ROOT, "schemas");

/** Default governance config schema filename */
const DEFAULT_SCHEMA_FILE = "governance-config.schema.json";

/**
 * Loads a JSON Schema file.
 *
 * @param {string} [schemaName] - Schema filename (default: governance-config.schema.json)
 * @returns {object} Parsed JSON Schema object
 * @throws {Error} When schema file is missing or parse fails
 */
export function loadSchema(schemaName = DEFAULT_SCHEMA_FILE) {
  const schemaPath = join(SCHEMAS_DIR, schemaName);

  if (!existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }

  const content = readFileSync(schemaPath, "utf-8");

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Schema file parse failed: ${schemaPath}\n${err.message}`);
  }
}

/**
 * Creates an Ajv instance.
 *
 * @returns {import("ajv").default} Configured Ajv instance
 */
function createAjv() {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false,
  });

  addFormats(ajv);

  return ajv;
}

/**
 * Validates data against JSON Schema.
 *
 * @param {object} data - Data to validate
 * @param {object} [schema] - JSON Schema object (loads default if not specified)
 * @returns {{ valid: boolean, errors: Array<{ path: string, message: string, params: object }> | null }}
 */
export function validateConfig(data, schema) {
  const resolvedSchema = schema || loadSchema();
  const ajv = createAjv();

  const validate = ajv.compile(resolvedSchema);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: null };
  }

  const errors = (validate.errors || []).map((err) => ({
    path: err.instancePath || "/",
    message: err.message || "Validation failed",
    params: err.params || {},
    schemaPath: err.schemaPath || "",
  }));

  return { valid: false, errors };
}

/**
 * Formats validation errors into human-readable form.
 *
 * @param {Array<{ path: string, message: string, params: object }>} errors - Validation error array
 * @returns {string} Formatted error string
 */
export function formatErrors(errors) {
  if (!errors || errors.length === 0) {
    return "No errors";
  }

  return errors
    .map((err, i) => {
      const location = err.path || "(root)";
      return `  ${i + 1}. [${location}] ${err.message}`;
    })
    .join("\n");
}
