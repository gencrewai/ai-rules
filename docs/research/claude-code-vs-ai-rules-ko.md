# Claude Code 공식 거버넌스 vs ai-rules — 비교 분석

> **작성일**: 2026-04-06
> **분석 범위**: [Claude Code 공식 플러그인/예제](https://github.com/anthropics/claude-code) (공개 저장소) vs ai-rules (이 프로젝트)
> **목적**: 두 시스템의 거버넌스, 안전, 에이전트 제어 아키텍처를 비교하고 상호 보완점을 도출
> **관련 문서**: 커뮤니티 hook 프로젝트 분석은 [community-hooks-analysis.md](community-hooks-analysis.md) 참조

---

## 0. 분석 방법 및 한계

### 확인 범위

- **Claude Code 공식**: 공개 저장소(anthropics/claude-code) 클론 기준. `plugins/` (14개), `examples/settings/` (3개), `CHANGELOG.md`, 각 플러그인 README, `hooks.json`, `SKILL.md`, agent frontmatter 확인. Anthropic 내부 소스코드(비공개)는 **포함하지 않음**.
- **ai-rules**: 이 프로젝트의 `core/` (11개 규칙 파일), `engine/adapters/` (7개 어댑터), `core/agents/` (9개 에이전트), `engine/governance/` (전체).

### 주의: 서로 다른 레이어

이 문서는 **서로 다른 레이어에서 작동하는 시스템을 비교**한다:

- Claude Code 공식 = **플랫폼 기능** (런타임이 보장하는 기술적 차단, sandbox, permission 시스템)
- ai-rules = **운영 프로세스/정책** (Advisory 텍스트 규칙 + shell hook 이중화)

완전한 apples-to-apples 비교가 아니다. "Claude Code에 없음"은 "공개 저장소에서 발견하지 못함"을 의미하며, Anthropic 내부 로드맵이나 비공개 기능은 반영하지 않았다. "ai-rules에 없음"도 "현재 구현에서 확인되지 않음"을 뜻한다.

### 재검증하지 않은 항목

- Claude Code 런타임의 실제 sandbox 격리 수준 (문서 기준 분석, 침투 테스트 미수행)
- `forceRemoteSettingsRefresh`의 실제 fail-closed 동작 (설정 문서 기준, 네트워크 단절 시나리오 미검증)
- prompt 타입 hook의 LLM 판단 정확도 및 latency 영향

---

## 1. 분석 대상 개요

| 항목 | Claude Code (공식) | ai-rules |
|------|-------------------|----------|
| 성격 | Anthropic 공식 플러그인/예제/가이드 | 멀티 도구 규칙 관리 프레임워크 |
| 규모 | 14+ 플러그인, 설정 예제, 스킬/에이전트 가이드 | 11개 core 규칙, 7개 어댑터, 9개 에이전트, 거버넌스 엔진 |
| 대상 도구 | Claude Code 단일 | Claude Code, Cursor, Windsurf, openclaw 등 7개 도구 |
| 적용 범위 | 범용 (모든 사용자) | 프로젝트 프로파일로 개별 맞춤 |

---

## 2. 아키텍처 비교

### 2.1 거버넌스 적용 방식

| 차원 | Claude Code 공식 | ai-rules |
|------|-----------------|----------|
| **정책 전달** | `settings.json` 계층 (managed -> remote -> user -> local) | `CLAUDE.md` 텍스트 (global -> project) |
| **강제력** | **Deterministic** — 설정 파일로 도구 레벨 차단 | **Advisory + Hook 이중화** — 텍스트 규칙 + shell hook |
| **권한 모델** | `ask/deny/allow/auto/bypass` 5단계 | `R0/R1/R2` 가역성 3단계 |
| **Enterprise** | `managed-settings.json` + `forceRemoteSettingsRefresh` (fail-closed) | 해당 없음 (개인/소규모 팀 대상 설계) |

#### ai-rules 강점

- **가역성(Reversibility) 프레임워크**: R0/R1/R2 등급은 Claude Code에 없는 개념. "차단할까?"가 아닌 "되돌릴 수 있는가?"로 판단하는 것이 실무에서 더 실용적
- **확인 문구 재입력 패턴**: `CONFIRM reset-{db}-{date}` — 날짜 포함으로 복붙 재사용 방지. Claude Code에는 동등한 마찰 메커니즘이 없음

#### Claude Code 강점

- **Deterministic enforcement**: `permissions.deny: ["WebSearch"]`로 설정하면 AI 의지와 무관하게 100% 차단. ai-rules의 텍스트 규칙은 컨텍스트 압박 시 무시될 수 있음
- **Bash Sandbox**: Bash 도구에 한정된 실행 격리 및 네트워크 차단. 참고: sandbox는 Bash 도구에만 적용되며 Read, Write, WebSearch, WebFetch, MCP, hook, 내부 명령에는 적용되지 않음. ai-rules에는 ��응하는 실행 격리 레이어가 없음
- **Enterprise managed settings 계층**: 조직 -> 원격 -> 사용자 -> 세션 순으로 정책 cascade

---

### 2.2 Hook 시스템

| 차원 | Claude Code 공식 | ai-rules |
|------|-----------------|----------|
| **Hook 이벤트** | 8+ 종류 (PreToolUse, PostToolUse, Stop, SubagentStop, SessionStart/End, UserPromptSubmit, FileChanged 등) | PreToolUse + Pre-commit (Bash matcher 중심) |
| **Hook 타입** | `command` + **`prompt`** (LLM 기반 판단) | `command`만 (shell script) |
| **Hook 출력** | JSON 구조화 (이벤트별 스키마 상이 — 아래 참고) | exit code (0=통과, 1=차단) |
| **Hook 입력** | stdin JSON (session_id, transcript_path, tool_name, tool_input 등) | `$TOOL_INPUT` 환경변수 |

**Hook 출력 스키마 참고**: 출력 구조는 이벤트 타입별로 다르다. PreToolUse hook은 `hookSpecificOutput.permissionDecision` (`allow/deny/ask`)과 선택적으로 `updatedInput`을 사용한다. Stop/SubagentStop hook은 `decision: approve/block`을 사용한다. 서로 다른 스키마이므로 혼동하지 않아야 한다.

#### Claude Code 강점

- **`prompt` 타입 hook**: LLM이 컨텍스트를 이해해서 판단 — "이 파일 수정이 적절한가?". Shell 정규식으로는 불가능한 의미론적 검증
- **`updatedInput`** (PreToolUse 전용): Hook이 tool input을 수정해서 반환 가능 (예: 파일 경로를 안전한 경로로 변경). ai-rules는 차단만 가능
- **SessionStart/End, FileChanged, CwdChanged**: ai-rules에 없는 라이프사이클 hook

#### ai-rules 강점

- **MUST-HOOK / SHOULD-HOOK / TEXT-ONLY 분류 체계** (`09-hooks-guide.md`): "이 규칙은 hook으로 올려야 하는가?"의 명확한 판단 기준. Claude Code 공개 문서에서는 발견되지 않음
- **Advisory -> Deterministic 전환 판단 기준** (3가지 질문): 되돌릴 수 없는 피해 / 컨텍스트에서 무시된 적 / 절대 실행 불가

---

### 2.3 에이전트 패턴

| 차원 | Claude Code 공식 | ai-rules |
|------|-----------------|----------|
| **에이전트 정의** | `agents/` MD + YAML frontmatter | `agents/` MD + YAML frontmatter (동일 형식) |
| **권한 제한** | `tools: [Read, Grep, Glob]` | `tools: [Read, Glob, Grep]` (동일) |
| **트리거** | description 필드 + `<example>` 블록으로 자동 트리거 | 수동 소환 기준 테이블 |
| **오케스트레이션** | feature-dev 플러그인: 7단계 워크플로 + 병렬 에이전트 | `planner -> builder -> [qa] -> reviewer -> [security]` 순차 소환 |
| **Teammate** | 공식 기능 (병렬 독립 에이전트) | 패턴 문서화만 (`10-subagent-patterns.md`) |

#### Claude Code 강점

- **자동 트리거**: 상세한 description과 `<example>` 블록이 포함된 에이전트 정의는 사용자 요청 분석 기반의 자동 소환을 가능하게 하는 것으로 보인다. 다만 `<example>` 블록 자체가 직접적 트리거인지, description 전체 품질이 주요 요인인지는 독립적으로 검증하지 않음
- **feature-dev 플러그인**: 7단계 워크플로 + 병렬 에이전트 실행 + 사용자 승인 게이트가 통합된 완성형 오케스트레이션
- **SubagentStop hook**: subagent 완료 시점 제어

#### ai-rules 강점

- **Context Budget 가이드라인**: "탐색 파일 5개 이하 = 메인 세션, 6개 이상 = Subagent 위임" 같은 정량 기준. Claude Code에서는 기본 제공 가이드가 발견되지 않음
- **역할별 모델 분리**: reviewer/security는 `claude-opus-4-6`, 나머지는 기본 모델. Claude Code도 지원하지만 명시적 가이드가 약함

---

## 3. ai-rules만의 차별화 (Claude Code에 없는 것)

### 3.1 멀티 AI 도구 동기화

```
core/ + extensions/ -> adapters/ -> Claude Code, Cursor, Windsurf, openclaw, plain
```

**동일한 규칙 집합을 7개 AI 도구에 동시 배포.** Claude Code는 자체 도구만 대상.

### 3.2 프로젝트 프로파일 시스템

```yaml
# profiles/my-saas-app.yaml
project: my-saas-app
target_path: ./my-saas-app
tools: [claude-code, cursor, plain]
governance: { preset: saas }
extensions: [custom-agents, custom-ci]
```

프로파일로 여러 프로젝트를 각각 다른 규칙 조합으로 관리. Claude Code 공개 저장소에서는 대응하는 멀티 프로젝트 프로파일 시스템이 발견되지 않음.

### 3.3 가역성 프레임워크 (R0/R1/R2)

4가지 판단 축으로 모든 작업을 분류:

| 판단 축 | 질문 |
|---------|------|
| 데이터 손실 | 실행 후 데이터가 사라지는가? |
| 외부 시스템 | 다른 서비스/DB/인프라에 영향이 가는가? |
| 복구 비용 | 되돌리려면 얼마나 많은 작업이 필요한가? |
| 영향 범위 | 변경이 1개 행/파일을 초과하는가? |

Claude Code는 `ask/deny/allow/auto/bypass` 권한/실행 모드를 사용한다 — 이는 *도구 실행 여부*를 제어한다. ai-rules의 R0/R1/R2는 다른 축에서 작동한다: *작업의 가역성*을 판단한다.

### 3.4 규칙 충돌 해결 체계

- 명시적 우선순위: security > git > workflow > other
- Tie-breaker 4원칙
- 충돌 판정표 (8가지 시나리오)

Claude Code는 `managed > remote > user > local` 설정 계층은 있지만, **규칙 간 의미론적 충돌 해결** 메커니즘은 발견되지 않음.

### 3.5 세션 핸드오프 프로토콜

```
---HANDOFF---
date / branch / status / done / next / blocked / failures / first_action
---END---
```

Claude Code에 내장된 구조화된 handoff 형식은 발견되지 않음. SessionStart hook이나 플러그인으로 컨텍스트 주입 자체는 가능하지만, 이전 에이전트의 작업 상태/실패/의사결정을 전달하는 표준 프로토콜(HANDOFF 블록 같은)은 내장 기능으로 제공되지 않는다.

### 3.6 DB 안전 규칙 (07-db)

- DB 이름 충돌 방지 (실제 사고 사례 기반)
- 파괴적 명령어 금지 테이블
- Migration 실행 프로세스 표준
- `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` 환경변수 가이드

Claude Code의 security-guidance 플러그인은 일반 보안을 다루지만, DB 특화 안전 규칙(이름 충돌, migration 프로세스 등)은 발견되지 않음.

---

## 4. Claude Code만의 차별화 (ai-rules에 없는 것)

### 4.1 Bash Sandbox

```json
{
  "sandbox": {
    "enabled": true,
    "allowUnsandboxedCommands": false,
    "network": {
      "allowedDomains": [],
      "allowLocalBinding": false,
      "allowAllUnixSockets": false
    }
  }
}
```

**Bash 도구에 한정된** 실행 격리 + 네트워크 차단. sandbox는 다른 도구(Read, Write, WebSearch, WebFetch, MCP), hook, 내부 명령에는 적용되지 않는다. ai-rules는 shell hook으로 명령어 패턴만 차단.

### 4.2 Prompt 타입 Hook

```json
{
  "type": "prompt",
  "prompt": "이 파일 수정이 보안에 적절한가 평가하라: $TOOL_INPUT"
}
```

LLM 판단으로 의미론적 검증. Shell 정규식 매칭으로는 불가능한 수준.

### 4.3 Plugin Marketplace

공식 마켓플레이스 + `strictKnownMarketplaces`로 조직 차원 플러그인 제어. ai-rules는 중앙 관리형 모델.

### 4.4 MCP 통합 가이드

stdio/SSE/HTTP/WebSocket 4가지 서버 타입 + `allowedMcpServers`/`deniedMcpServers` 정책. ai-rules에 MCP 서버 디렉토리가 있지만 아직 초기 단계.

### 4.5 Hookify (사용자 친화 Hook 생성)

```
/hookify rm -rf 명령어 사용 시 경고해줘
```

마크다운 YAML frontmatter로 hook 자동 생성. ai-rules의 hook은 직접 shell script 작성 필요.

### 4.6 Hook Output 구조화 (`updatedInput`)

Hook이 tool input을 변환해서 반환 가능:

```json
{
  "decision": "approve",
  "updatedInput": { "file_path": "/safe/path/file.txt" },
  "systemMessage": "경로가 안전한 위치로 변경되었습니다"
}
```

ai-rules는 차단(exit 1) 또는 통과(exit 0)만 가능.

### 4.7 Enterprise 설정 계층

| 계층 | 파일 | 통제 범위 |
|------|------|---------|
| 1. Enterprise Managed | `managed-settings.json` + `managed-settings.d/` | 조직 정책 (override 불가) |
| 2. Remote Sync | `remote-settings.json` | 클라우드 정책 동기화 |
| 3. User Config | `.claude/settings.json` | 개인 설정 |
| 4. Session Override | `.claude/settings.local.json` | 임시 설정 |

`forceRemoteSettingsRefresh: true` — 원격 정책을 가져올 때까지 시작 차단 (fail-closed).

---

## 5. 종합 평가

| 평가 축 | Claude Code 공식 | ai-rules |
|---------|-----------------|----------|
| **강제력** | Deterministic (설정 차단) | Advisory + Hook |
| **유연성** | 단일 도구 대상 | 7개 도구 동시 배포 |
| **Enterprise** | managed settings, remote sync, fail-closed | 해당 없음 |
| **실무 지혜** | 범용 가이드 | 사고 사례 기반 규칙 (DB 충돌, 핸드오프 실패 등) |
| **Hook 고도화** | prompt hook, updatedInput, 8+ 이벤트 | command hook, 2개 이벤트 |
| **에이전트 오케스트레이션** | 자동 트리거, 병렬 실행 | 수동 소환, 순차 실행 |
| **위험 판단 체계** | ask/deny/allow (권한 중심) | R0/R1/R2 (가역성 중심) |
| **세션 연속성** | 기본 제공 없음 | HANDOFF 프로토콜 |
| **문서화** | 플러그인별 분산 | 체계적 handbook (docs/ 50+) |

---

## 6. 결론

Claude Code 공식은 **플랫폼 레벨의 강제력**(sandbox, deterministic hook, managed settings)이 강점이고, ai-rules는 **운영 레벨의 실무 지혜**(가역성 판단, 세션 핸드오프, DB 안전, 멀티 도구)가 강점이다.

두 시스템은 **경쟁이 아닌 상호 보완** 관계:

```
Claude Code 공식 = "무엇을 기술적으로 차단할 수 있는가"     (Platform Layer)
ai-rules        = "무엇을 왜, 어떤 기준으로 차단해야 하는가" (Policy Layer)
```

이상적인 조합은 ai-rules의 **정책 프레임워크** 위에 Claude Code의 **플랫폼 기능**(prompt hook, sandbox, agent auto-trigger)을 활용하는 것이다 — 플랫폼 강제력과 운영 지혜가 서로를 보강하는 거버넌스 체계.

---

## 7. 로드맵 — 개선 계획

이 분석을 바탕으로 ai-rules에 계획된 개선 사항:

### 즉시 도입 가능 (플랫폼 의존 없음)

| 우선순위 | 항목 | 세부 내용 |
|---------|------|---------|
| **P1** | prompt 타입 hook 가이드 | `09-hooks-guide.md`에 `prompt` hook 섹션 추가 + 예제 JSON. Claude Code가 이미 지원하므로 문서만 추가하면 즉시 사용 가능 |
| **P2** | 에이전트 `<example>` 블록 | 각 에이전트 정의에 2~4개 `<example>` 블록 추가. Claude Code 자동 트리거 호환 |
| **P3** | SessionStart hook | `06-session` Step 0~5 체크(git status, INTENT.md, HANDOFF 블록)를 SessionStart command hook으로 자동화 |

### 플랫폼 지원 전제 (Claude Code 기능 검증 필요)

| 우선순위 | 항목 | 의존 대상 |
|---------|------|---------|
| **P4** | Sandbox preset | sandbox 격리 수준 검증 후 `governance/presets/`에 통합 |
| **P5** | Hookify 패턴 생성 | hookify 플러그인 YAML 스펙 안정화 대기 |
| **P6** | Hook `updatedInput` 지원 | hook 아키텍처 변경 필요 (exit code -> JSON stdout) |

### 유지해야 할 강점

| 강점 | 근거 |
|------|------|
| **멀티 도구 동기화** | Claude Code만의 세상이 아님. Cursor, Windsurf 사용자도 동일 규칙 필요 |
| **R0/R1/R2 가역성** | ask/deny 이분법보다 실무적. "차단할까?"가 아니라 "되돌릴 수 있는가?" |
| **세션 핸드오프** | 장시간 작업의 맥락 보존. Claude Code에 아직 없는 영역 |
| **DB 안전 규칙** | 실제 사고 경험 기반. 범용 보안 플러그인으로 대체 불가 |
| **규칙 충돌 해결** | Advisory 규칙이 많을수록 충돌 해결 체계가 중요 |
| **Context Budget 정량 가이드** | 에이전트 효율의 실무 가이드. 공식 문서에 없음 |
