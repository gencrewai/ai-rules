# Changelog (한국어)

`ai-rules`의 모든 주요 변경 사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따릅니다.
English version: [CHANGELOG.md](CHANGELOG.md)

## [Unreleased]

> 작성자: Claude Code (Opus 4.6)
> 승인: gencrew
>
> 릴리스 날짜는 이 섹션이 버전 릴리스로 격상될 때
> (예: `## [0.2.0] - 2026-04-08`) 함께 기재됩니다. 그 전까지
> 개별 변경의 타임스탬프는 git 커밋 메타데이터를 참고하세요.

### Added — `scaffold --tools` (단일 프로젝트 멀티 도구 에이전트)

- **`scaffold` CLI에 `--tools claude-code,codex,cursor` 플래그 추가.**
  sync profile을 따로 만들지 않아도 단일 프로젝트 빠른 시작 단계에서 세 러너에
  동시에 에이전트를 배포할 수 있습니다.
- `claude-code`(기본)와 `codex`는 Node 내장 모듈만 사용 — zero-install 보장 유지.
  `cursor`는 실제 Cursor 어댑터를 dynamic import하여 `js-yaml`이 필요하지만,
  없으면 `npm install` 안내 메시지를 출력하고 scaffold 전체가 깨지지 않습니다.
- 새 도구의 규칙 파일(`AGENTS.md`, `.cursor/rules/*.mdc` 등)과 나머지 러너
  지원은 기존대로 sync 엔진 영역으로 남아있습니다. scaffold은 "60초 안에 새
  저장소" 유스케이스에 집중.
- 구현: `engine/lib/scaffold-agents.mjs` 신규 (`deployAgentsForTool()` +
  `parseToolsArg()`), `engine/lib/scaffold.mjs`의 Step 2.5를 output-docs
  복사와 독립적으로 분리 (`--no-docs`에서도 에이전트 배포),
  `engine/cli/scaffold.mjs`에 `-t, --tools` 플래그 및 미지원 도구 경고 경로 추가.

### Added — 멀티 도구 에이전트 배포 (10+ 러너)

- **에이전트가 Claude Code뿐 아니라 활성화된 모든 도구에 배포됩니다.**
  기존 `sync.mjs`는 에이전트 출력 경로가 `.claude/agents/{name}.md`로
  하드코딩돼 있었습니다. 이제 각 어댑터의 `generateAgents()` export로
  도구별 위임합니다.
- **7개 신규 어댑터** — `core/agents/*.md`를 각 도구의 네이티브 레이아웃으로
  변환:
  - `codex` — `.codex/agents/` 네이티브 에이전트 + `AGENTS.md` 규칙
  - `cursor` — `.cursor/rules/agents/*.mdc` (`alwaysApply: false`)
  - `windsurf` — `.windsurf/rules/agents/`
  - `gemini` — `.gemini/agents/` + `GEMINI.md`
  - `copilot` — `.github/copilot-agents/` + 인덱스 + `.github/copilot-instructions.md`
  - `cline` — `.cline/agents/` + `.clinerules`
  - `antigravity` — `.agent/agents/` + `AGENTS.md` (Gemini 백엔드 경로 치환 처리)
- **`generic` 어댑터** — YAML만으로 선언 가능한 롱테일 러너 지원
  (`adapter: generic` + `output` + `path_rewrites`). Kilo / Augment / Trae는
  `examples/profiles/longtail-runners.example.yaml`로 즉시 사용 가능하며,
  향후 새 도구도 어댑터 코드 변경 없이 추가할 수 있습니다.
- **공용 `engine/lib/agent-transform.mjs`** — frontmatter 파싱/스트링화,
  도구별 경로 치환 테이블(`CLAUDE.md` → 도구별 규칙 파일,
  `.claude/agents/` → 도구별 디렉토리), MDC 변환, 그리고 Claude 전용
  호출부("invoke the Task tool" → "이 역할로 작동하라" 등) 중립화를
  제공 — 네이티브 서브에이전트가 없는 도구에서 자연스럽게 작동하도록.
- **프로필 YAML에 도구별 에이전트 스위치**: 각 `tools.<tool>`이 이제
  `agents: { enabled, output }`을 독립적으로 수용 — opt-in/opt-out 및
  출력 경로 override가 도구 단위로 가능.

### Added — Manifest, uninstall, 안전한 재동기화

- **`engine/lib/manifest.mjs`** — SHA256 해시 기반 파일 추적으로 다음 기능 제공:
  1. **Orphan 감지 + `--prune`** — 이전 sync에 포함됐지만 이번에는 생성되지
     않는 파일(예: 도구가 비활성화됨)을 매 실행마다 보고하며,
     `--prune` 시 삭제.
  2. **사용자 수정 보호** — manifest에 기록된 해시와 현재 디스크 해시가
     다르면 로컬 수정으로 간주해 기본 스킵하고 보고. `--force`가 있을 때만 덮어쓰기.
  3. **깔끔한 uninstall** — `node engine/scripts/sync.mjs --uninstall --project X`
     가 이전 manifest에 기록된 모든 파일을 삭제(역시 `--force` 없으면 사용자
     수정 파일은 보존).
- **Manifest v2 스키마** (`{ version, project, target_paths, synced_at, files: [{ path, hash, tool }] }`)
  로 기존 플랫 리스트 `sync-status.json`을 대체합니다. v1 manifest도
  호환 읽기 — 기존 엔트리는 해시가 없을 뿐 다음 전체 sync부터 완전 추적.
- **신규 `npm` 스크립트**: `sync:prune`, `sync:uninstall`.
- **신규 CLI 플래그**: `--prune`, `--uninstall`, `--force`.

### Added — Adapter resolver

- `sync.mjs`의 `resolveAdapter(toolName, config)` 가 다음 우선순위로
  도구 엔트리를 어댑터에 라우팅합니다:
  1. `config.adapter` (명시적 지정, 예: `adapter: generic`)
  2. 도구 이름과 일치하는 내장 어댑터 (`claude-code`, `codex`, …)
  3. `output`이 정의돼 있으면 `generic` fallback
  
  덕분에 "규칙 파일 + 역할별 컨텍스트" 패턴을 따르는 신규 도구는 JS
  어댑터 파일을 추가하지 않고 선언적으로 파이프라인에 합류 가능합니다.

### Changed (변경)

- **`INTENT.md`가 모든 core 규칙에서 선택적 anchor로 강등되었습니다.**
  `INTENT.md`가 없는 프로젝트도 더 이상 규칙 위반이나 bootstrap 경고를
  유발하지 않습니다. 영향 파일: `02-code`, `04-workflow`, `05-responses`,
  `06-session`, `08-ui-first`. 규칙들은 이제 INTENT.md를 "프로젝트가
  사용 중인 경우"로 참조하며, 하나의 schema 변경이 6개 이상의 파일을
  동시에 수정하게 만들던 cascade 문제가 제거되었습니다.

- **`04-workflow`와 `06-session`의 역할이 명확히 분리되었습니다.**
  `04-workflow`는 작업 *흐름*(modes, gates, plan mode, WORKLOG 주기,
  failure protocol, decision log)을 담당합니다. `06-session`은 세션
  *경계*(start steps, HANDOFF 블록, context-limit 트리거, ACTIVE_WORK
  업데이트)를 담당합니다. context-limit 트리거, WORKLOG 주기,
  세션 시작 시 anchor 읽기 순서의 중복 정의가 모두 제거되어 각각
  한 파일에만 정의되며, 다른 쪽에는 한 줄 포인터만 남았습니다.

### Reduced (축소)

- **`SESSION.md` HANDOFF 블록이 약 10개 필드에서 필수 3개 + 선택 3개로
  축소되었습니다.**
  - 필수: `status`, `next`, `blocked`
  - 선택: `done`, `failures`, `handoff_provenance`
  - 삭제: `date`, `branch`, `agent`, `files_touched`, `verify_cmd`,
    `first_action` — git이 이미 제공하는 정보입니다.

  기존 `SESSION.md` 파일은 그대로 읽을 수 있습니다. 새 세션부터
  축소된 schema로 작성됩니다. `03-security`의 R2 audit trail은
  여전히 선택 필드 `done`을 사용하며, 이 사용 사례는 `06-session`에
  명시적으로 문서화되어 있습니다.

### Fixed (수정)

- **`engine/scripts/validate.mjs`가 현재 디렉토리 구조에 맞게 갱신되었습니다.**
  이전에는 리팩토링 이전 경로(`engine/core/` + `engine/profiles/`)를
  가리키고 있어서 디렉토리 없음 에러로 크래시했습니다. 이제
  `core/rules/` + `examples/profiles/`와 일치하며, 선택적 디렉토리
  (`extensions/`, `agents/`, `output/`)가 없을 때는 graceful하게
  skip됩니다.

### Background (배경)

L1~L3 리팩토링은 최근 커밋들에서 관찰된 cascade 패턴에서 출발했습니다.
작은 수정 하나가 4~5개 파일 동시 수정을 강제하는 문제였습니다.
규칙 간 결합도 분석(참조 그래프, 공유 artifact의 fan-out, 우선순위 도출)은
[`docs/research/rule-coupling-diagnosis.md`](docs/research/rule-coupling-diagnosis.md)
를 참고하세요.

### Migration Notes (Sync 소비 프로젝트용)

- **`INTENT.md`를 사용 중인 프로젝트는 별도 조치 불필요** — 파일이
  존재할 때의 동작은 그대로입니다.
- **기존 `SESSION.md` 파일도 별도 조치 불필요** — 옛 필드는 거부되지
  않고 무시됩니다.
- HANDOFF 필드를 자동으로 파싱하는 도구가 있다면, `date` / `branch` /
  `agent` / `files_touched` / `verify_cmd` / `first_action`은 더 이상
  보장되지 않으므로 git에서 직접 읽어오는 방식으로 전환을 권장합니다.
