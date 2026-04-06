import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

export function setupAiLogs({
  projectDir,
  aiRulesRoot,
  projectName,
  logger = () => {},
  dryRun = false,
}) {
  const templateDir = join(aiRulesRoot, 'engine', 'templates', 'ai-logs')
  const touchedFiles = []

  ensureDirectory(join(projectDir, 'ai_logs'), dryRun, logger)
  ensureDirectory(join(projectDir, 'ai_logs', 'raw'), dryRun, logger)
  ensureDirectory(join(projectDir, 'scripts'), dryRun, logger)

  ensureFile({
    targetPath: join(projectDir, 'ai_logs', 'raw', '.gitkeep'),
    content: '',
    label: 'ai_logs/raw/.gitkeep',
    dryRun,
    logger,
    touchedFiles,
  })

  copyTemplateIfExists({
    srcPath: join(templateDir, 'README.md'),
    dstPath: join(projectDir, 'ai_logs', 'README.md'),
    label: 'ai_logs/README.md',
    dryRun,
    logger,
    touchedFiles,
  })

  copyTemplateIfExists({
    srcPath: join(templateDir, 'export_ai_logs.ps1'),
    dstPath: join(projectDir, 'scripts', 'export_ai_logs.ps1'),
    label: 'scripts/export_ai_logs.ps1',
    dryRun,
    logger,
    touchedFiles,
  })

  ensurePackageJsonScript({
    projectDir,
    projectName,
    dryRun,
    logger,
    touchedFiles,
  })

  ensureGitignoreEntries({
    projectDir,
    dryRun,
    logger,
    touchedFiles,
  })

  return touchedFiles
}

function ensureDirectory(path, dryRun, logger) {
  if (dryRun) {
    logger(`[dry-run] MKDIR: ${toRelativeLabel(path)}`)
    return
  }

  mkdirSync(path, { recursive: true })
  logger(`MKDIR: ${toRelativeLabel(path)}`)
}

function ensureFile({ targetPath, content, label, dryRun, logger, touchedFiles }) {
  touchedFiles.push(label)

  if (dryRun) {
    logger(`[dry-run] CREATE: ${label}`)
    return
  }

  if (!existsSync(targetPath)) {
    writeFileSync(targetPath, content, 'utf-8')
    logger(`CREATE: ${label}`)
  } else {
    logger(`SKIP: ${label} already exists`)
  }
}

function copyTemplateIfExists({ srcPath, dstPath, label, dryRun, logger, touchedFiles }) {
  if (!existsSync(srcPath)) {
    logger(`SKIP: ${label} template not found`)
    return
  }

  touchedFiles.push(label)

  if (dryRun) {
    logger(`[dry-run] COPY: ${label}`)
    return
  }

  copyFileSync(srcPath, dstPath)
  logger(`COPY: ${label}`)
}

function ensurePackageJsonScript({ projectDir, projectName, dryRun, logger, touchedFiles }) {
  const packageJsonPath = join(projectDir, 'package.json')
  const aiLogsCommand = 'powershell -ExecutionPolicy Bypass -File ./scripts/export_ai_logs.ps1'
  let packageJson

  if (existsSync(packageJsonPath)) {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
  } else {
    packageJson = {
      name: `${projectName}-tools`,
      private: true,
      scripts: {},
    }
  }

  if (!packageJson.scripts || typeof packageJson.scripts !== 'object') {
    packageJson.scripts = {}
  }

  packageJson.scripts['ai:logs'] = aiLogsCommand
  touchedFiles.push('package.json')

  if (dryRun) {
    logger('[dry-run] UPDATE: package.json (scripts.ai:logs)')
    return
  }

  writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf-8')
  logger('UPDATE: package.json (scripts.ai:logs)')
}

function ensureGitignoreEntries({ projectDir, dryRun, logger, touchedFiles }) {
  const gitignorePath = join(projectDir, '.gitignore')
  const requiredEntries = [
    '',
    '# AI logs raw exports (keep curated logs)',
    'ai_logs/done/',
  ]

  let current = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, 'utf-8')
    : ''

  let changed = false
  for (const entry of requiredEntries) {
    const needle = entry === ''
      ? '\n# AI logs raw exports (keep curated logs)'
      : entry

    if (!current.includes(needle)) {
      current += (current.endsWith('\n') || current.length === 0 ? '' : '\n') + entry + '\n'
      changed = true
    }
  }

  if (!changed) {
    logger('SKIP: .gitignore already includes entries')
    return
  }

  touchedFiles.push('.gitignore')

  if (dryRun) {
    logger('[dry-run] UPDATE: .gitignore (ai_logs block)')
    return
  }

  writeFileSync(gitignorePath, current, 'utf-8')
  logger('UPDATE: .gitignore (ai_logs block)')
}

function toRelativeLabel(path) {
  const normalized = path.replace(/\\/g, '/')
  const match = normalized.match(/(ai_logs(?:\/.*)?|scripts(?:\/.*)?)$/)
  return match ? match[1] : normalized
}
