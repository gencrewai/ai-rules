/**
 * yaml-simple.mjs — Simple YAML parser with no external dependencies
 * Dedicated to profiles/*.yaml parsing (no complex YAML support)
 * Use js-yaml package for complex YAML
 */

/**
 * Simple YAML parsing (nested objects, lists, strings)
 * multiline string (|, >) support
 */
export function parse(yamlStr) {
  // Use js-yaml if available (more accurate)
  try {
    const { load } = await importJsYaml()
    return load(yamlStr)
  } catch {
    // fallback: simple parser
    return simpleParse(yamlStr)
  }
}

async function importJsYaml() {
  return import('js-yaml')
}

function simpleParse(yamlStr) {
  const lines = yamlStr.split('\n')
  const result = {}
  const stack = [{ obj: result, indent: -1 }]
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Skip comments or empty lines
    if (!trimmed || trimmed.startsWith('#')) { i++; continue }

    const indent = line.search(/\S/)
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) { i++; continue }

    const key = trimmed.slice(0, colonIdx).trim()
    const rest = trimmed.slice(colonIdx + 1).trim()

    // Clean up stack
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    const current = stack[stack.length - 1].obj

    if (rest === '' || rest === '{}') {
      // Nested object
      current[key] = {}
      stack.push({ obj: current[key], indent })
    } else if (rest === '[]') {
      current[key] = []
    } else if (rest === 'true') {
      current[key] = true
    } else if (rest === 'false') {
      current[key] = false
    } else if (rest.startsWith('|')) {
      // Multiline string
      const lines2 = []
      i++
      const baseIndent = indent + 2
      while (i < lines.length) {
        const l = lines[i]
        if (l.trim() === '' || l.search(/\S/) >= baseIndent) {
          lines2.push(l.slice(baseIndent))
          i++
        } else break
      }
      current[key] = lines2.join('\n').trimEnd()
      continue
    } else if (rest.startsWith('-')) {
      // First item of inline list
      current[key] = [rest.slice(1).trim()]
    } else {
      current[key] = rest.replace(/^["']|["']$/g, '')
    }

    i++
  }

  // Process list items (- item format)
  return postProcessLists(yamlStr)
}

function postProcessLists(yamlStr) {
  // Fallback when js-yaml unavailable — minimal parsing only
  // Recommended to install js-yaml for actual use: npm install js-yaml
  try {
    return JSON.parse(
      yamlStr
        .replace(/#.*/g, '')
        .replace(/:\s*true/g, ': true')
        .replace(/:\s*false/g, ': false')
    )
  } catch {
    console.warn('[yaml-simple] Parse failed — recommended: npm install js-yaml')
    return {}
  }
}
