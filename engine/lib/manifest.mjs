/**
 * manifest.mjs — Track files written by ai-rules so we can:
 *   1) detect orphans (files from a previous sync that are no longer emitted)
 *   2) detect user edits (file hash changed since last sync)
 *   3) uninstall cleanly (delete exactly what we wrote, nothing else)
 *
 * The manifest lives at `<output>/<project>/sync-status.json` and is generated
 * alongside every sync run. Schema (v2, superset of the original flat list):
 *
 *   {
 *     "version": 2,
 *     "project": "my-app",
 *     "target_paths": ["/abs/path/to/app"],
 *     "synced_at": "ISO-8601",
 *     "files": [
 *       { "path": ".claude/agents/planner.md", "hash": "sha256:...", "tool": "claude-code-agents" },
 *       ...
 *     ]
 *   }
 *
 * Hashes are computed over file CONTENT bytes. The hash stored is the
 * content we WROTE — so comparing it to the current target file tells us
 * whether the user has since edited it locally.
 */

import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'

export const MANIFEST_VERSION = 2

export function hashContent(content) {
  return 'sha256:' + createHash('sha256').update(content).digest('hex')
}

export function hashFile(filepath) {
  if (!existsSync(filepath)) return null
  return hashContent(readFileSync(filepath))
}

/**
 * Read a manifest, tolerating both the v1 flat-list format and the v2
 * structured format. Returns v2 shape (or null if no manifest exists).
 */
export function readManifest(outputDir) {
  const p = join(outputDir, 'sync-status.json')
  if (!existsSync(p)) return null
  let json
  try {
    json = JSON.parse(readFileSync(p, 'utf-8'))
  } catch (_) {
    return null
  }
  if (json.version === MANIFEST_VERSION) return json
  // v1 fallback: files was a plain string[] with no hashes
  if (Array.isArray(json.files) && typeof json.files[0] === 'string') {
    return {
      version: 1,
      project: json.project,
      target_paths: json.target_paths || [],
      synced_at: json.synced_at,
      files: json.files.map(path => ({ path, hash: null, tool: null })),
    }
  }
  return json
}

export function writeManifest(outputDir, manifest) {
  const p = join(outputDir, 'sync-status.json')
  writeFileSync(p, JSON.stringify({ ...manifest, version: MANIFEST_VERSION }, null, 2) + '\n', 'utf-8')
}

/**
 * Diff between previous manifest and current sync plan.
 * Returns { orphans, kept, added } by file path.
 *
 *   orphans : in previous manifest but NOT in current plan → candidates for prune/uninstall
 *   kept    : in both                                      → candidates for edit-guard check
 *   added   : only in current plan                         → brand-new files this sync
 */
export function diffManifest(prevManifest, currentPaths) {
  const prev = new Map((prevManifest?.files || []).map(f => [f.path, f]))
  const curr = new Set(currentPaths)

  const orphans = []
  const kept = []
  const added = []

  for (const [p, entry] of prev) {
    if (curr.has(p)) kept.push(entry)
    else orphans.push(entry)
  }
  for (const p of curr) {
    if (!prev.has(p)) added.push(p)
  }

  return { orphans, kept, added }
}

/**
 * Detect user edits: for every `kept` file, compare the current on-disk hash
 * at each target path against the hash recorded in the previous manifest.
 * Returns an array of { path, target, previousHash, currentHash }.
 *
 * Files whose previous hash is null (migrated from v1) are skipped — we
 * cannot distinguish sync-authored vs user-authored content without a baseline.
 */
export function detectUserEdits(kept, targetPaths) {
  const edits = []
  for (const entry of kept) {
    if (!entry.hash) continue
    for (const target of targetPaths) {
      const abs = join(target, entry.path)
      const current = hashFile(abs)
      if (current && current !== entry.hash) {
        edits.push({ path: entry.path, target, previousHash: entry.hash, currentHash: current })
      }
    }
  }
  return edits
}

/**
 * Delete orphan files from every target_path. Safe-by-default:
 * - only removes files the previous manifest claimed ownership of
 * - skips when the current on-disk hash differs from the manifest hash
 *   (means the user edited it post-sync — leave it alone)
 * - returns a report for logging
 */
export function pruneOrphans(orphans, targetPaths, { force = false } = {}) {
  const report = { removed: [], skipped_user_edited: [], missing: [] }
  for (const entry of orphans) {
    for (const target of targetPaths) {
      const abs = join(target, entry.path)
      if (!existsSync(abs)) {
        report.missing.push({ path: entry.path, target })
        continue
      }
      if (!force && entry.hash) {
        const current = hashFile(abs)
        if (current !== entry.hash) {
          report.skipped_user_edited.push({ path: entry.path, target })
          continue
        }
      }
      try {
        rmSync(abs, { force: true })
        report.removed.push({ path: entry.path, target })
      } catch (e) {
        report.skipped_user_edited.push({ path: entry.path, target, error: e.message })
      }
    }
  }
  return report
}
