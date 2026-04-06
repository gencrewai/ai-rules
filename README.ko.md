[English](README.md) | [한국어](README.ko.md)

# ai-rules

> 정책은 말하는 것이고, 하네스는 강제하는 것이다.

AI 코딩 에이전트를 위한 **구조화된 규칙 시스템**.
텍스트 기반 규칙(advisory)과 코드로 강제하는 가드레일(deterministic)을 결합하여 안전하고 일관된 AI 코딩 환경을 만듭니다.

---

## 왜 ai-rules인가?

AI 코딩 에이전트(Claude Code, Cursor, Copilot 등)에게 "main에 직접 커밋하지 마세요"라고 텍스트로 알려주면,
**대부분은 따릅니다. 하지만 컨텍스트가 길어지면 잊어버립니다.**

```
❌ CLAUDE.md: "main에 직접 커밋하지 마세요"
   → 컨텍스트 70% 초과 시 무시될 수 있음

✅ ai-rules: 텍스트 규칙 + pre-commit hook 이중 차단
   → AI가 잊어도 hook이 잡아냄
```

| 접근 방식 | 보장 수준 | 예시 |
|----------|---------|------|
| **Advisory** (텍스트) | AI가 따르려 노력 (컨텍스트 압박 시 무시 가능) | CLAUDE.md, .cursorrules |
| **Deterministic** (코드) | 항상 강제 (AI 의지와 무관) | hooks, git hooks, lint |

ai-rules는 두 가지를 **하나의 시스템**으로 관리합니다.

---

## 핵심 차별점

### 1. 가역성 기반 위험 평가 (R0/R1/R2)

패턴 매칭이 아니라 **"되돌릴 수 있는가?"** 를 기준으로 위험을 평가합니다.

| 등급 | 조건 | 에이전트 행동 |
|------|------|------------|
| **R0** — 완전 가역 | 로컬 변경, 즉시 되돌릴 수 있음 | 자동 실행 |
| **R1** — 제한적 가역 | 되돌릴 수는 있으나 비용 큼 | 사람 승인 필요 |
| **R2** — 비가역 | 데이터 손실, 외부 상태 변경 | 확인 문구 재입력 또는 사람 직접 실행 |

```
# 패턴 매칭으로는 잡히지 않지만 R2로 분류되는 예시:
psql -c "DELETE FROM users WHERE 1=1"     # 데이터 전체 삭제
git push origin HEAD:main                 # Cross-push
curl -X DELETE https://api.prod/...       # 외부 상태 변경
```

> **"패턴은 빠른 탐지기, 가역성은 최종 판정관."**

### 2. 6단계 에이전트 자율 모드

다른 도구는 "코드 수정 허용/차단"만 제어합니다.
ai-rules는 커밋, 푸시, PR, 배포를 **독립된 축**으로 분리합니다.

| 모드 | 커밋 | 푸시 | PR | 배포 | 대화 |
|------|------|------|----|------|------|
| `manual` | 자동 | X | X | X | 일반 |
| `auto` | 자동 | 자동 | 자동 | X | 일반 |
| `auto-push` | 자동 | 자동 | 자동 | develop | 최소 |
| `staging` | 자동 | 자동 | 자동 | staging | 최소 |
| `production` | 자동 | 자동 | 자동 | main | 최소 |
| `idle` | 자동 | 자동 | 자동 | staging | **금지** |

`idle` 모드: 야간 자율 실행. 오류 3회 시 자동 종료. 질문 불가.

### 3. 사람-AI 권한 경계

> **"예외를 승인하는 것은 사람뿐. 에이전트는 요청만 한다."**

| 위험 수준 | 확인 방식 |
|----------|---------|
| 낮음 (R0~R1) | `CONFIRM {작업}-{날짜}` |
| 중간 (R1~R2) | `CONFIRM {작업}-{4자리난수}-{날짜}` (에이전트가 난수 생성) |
| 높음 (R2) | 사람이 직접 실행, 또는 외부 채널 승인 |

### 4. 멀티 도구 동기화

하나의 규칙 소스에서 여러 도구용 출력을 생성합니다.

```
core/rules/01-git.md  ──┬──→  CLAUDE.md      (Claude Code)
                        ├──→  .cursor/rules/  (Cursor)
                        ├──→  .windsurfrules  (Windsurf)
                        └──→  AI-RULES.md     (기타)
```

---

## 2계층 구조: 필요한 것만 사용

```
ai-rules/
│
├── core/                  ← Tier 1: 규칙 + 에이전트 (바로 사용 가능)
│   ├── rules/             #   12개 규칙 파일
│   ├── agents/            #   9개 에이전트 역할 정의
│   └── README.md
│
├── engine/                ← Tier 2: 멀티 프로젝트 동기화 도구
│   ├── adapters/          #   Claude Code, Cursor, Windsurf 출력 변환기
│   ├── scripts/           #   sync, validate, onboard
│   ├── governance/        #   교차 검증 엔진
│   └── README.md
│
├── examples/              #   프로필, 확장, 에이전트 확장 예제
└── docs/guide/            #   설계 철학 및 주요 가이드
```

---

## 빠른 시작

### 방법 A: scaffold 명령어 (1분)

```bash
# CLI — 한 줄이면 됩니다
node engine/cli/scaffold.mjs --name my-app --dev-root ~/projects

# 또는 Claude Code MCP로 직접 실행
# → scaffold_project(name: "my-app", dev_root: "~/projects")
```

이 한 줄의 명령으로:
- 12개 규칙을 하나의 CLAUDE.md로 합성
- 9개 에이전트 역할 정의를 `.claude/agents/`에 복사
- 스택별 `.env.example`과 도구 권한 생성
- Git 초기화 + develop 브랜치 자동 생성 (main 보호)
- AI 로그 및 docs 디렉토리 구조 설정

외부 의존성 없음 — Node.js 내장 모듈만 사용. npm install 불필요.

### 방법 B: 규칙만 복사-붙여넣기 (5분)

도구 없이 핵심 규칙만 빠르게 적용하려면:

```bash
# 1. 필수 4개 규칙을 프로젝트 CLAUDE.md에 복사-붙여넣기
#    01-git, 02-code, 03-security, 04-workflow

# 2. 에이전트 역할 정의 복사
cp core/agents/*.md your-project/.claude/agents/
```

→ [core/README.md](core/README.md)

### 방법 C: sync 엔진 (멀티 프로젝트)

동일한 규칙을 여러 프로젝트에 배포하려면:

```bash
cd engine
npm install
npm run new -- my-project      # 프로필 생성
npm run sync                   # 규칙 생성 (dry-run)
npm run sync:apply             # 프로젝트에 적용
```

→ [engine/README.md](engine/README.md)

---

## 핵심 규칙 (12개)

| 파일 | 설명 | 핵심 기능 |
|------|------|---------|
| `00-identity` | 페르소나, 소통 방식, 언어 | 규칙 우선순위 충돌 매트릭스 |
| `01-git` | 브랜치, 커밋, 푸시 규칙 | 보호 브랜치 이중 차단 (텍스트 + hook) |
| `02-code` | 코드 아키텍처 Hard Bans | 스택별 금지 패턴 (React/FastAPI) |
| `03-security` | 보안, 가역성, STRIDE 체크 | R0/R1/R2 위험 등급 + 과도한 자율성 방지 |
| `04-workflow` | 에이전트 모드, Plan Mode | 6단계 자율성 + 4개 산출물 게이트 |
| `05-responses` | 응답 형식, 신뢰도 레이블 | 필수 레이블: `[검증됨]` / `[추론]` / `[모름]` |
| `06-session` | 세션 관리, HANDOFF 패턴 | 불신 + 재검증 모델 (에이전트 간 인수인계) |
| `07-db` | DB 안전 규칙, 마이그레이션 | DB 이름 충돌 방지 + 파괴적 명령 차단 |
| `08-local-env` | 포트/DB 충돌 방지 | 로컬 멀티 프로젝트 안전 운영 |
| `08-ui-first` | UI 목업 우선 원칙 | 구현 전 HTML 목업 확인 의무화 |
| `09-hooks-guide` | Advisory vs Deterministic | hook 강제가 필요한 규칙 판단 기준 |
| `10-subagent-patterns` | Subagent 활용 패턴 | 컨텍스트 보호 + 최소 권한 에이전트 팀 |

## 에이전트 역할 (9개)

| 에이전트 | 역할 | 허용 도구 | 모델 |
|---------|------|---------|------|
| `planner` | 작업 기획, INTENT.md | Read, Glob, Grep, WebSearch | 기본 |
| `builder` | 구현, 테스트, 커밋 | 전체 | 기본 |
| `reviewer` | 코드 리뷰, 보안 체크 | Read, Glob, Grep | Opus (정밀도) |
| `qa` | 테스트 실행, 검증 | Read, Glob, Grep, Bash | 기본 |
| `security` | 보안 리뷰 | Read, Glob, Grep | Opus (정밀도) |
| `architect` | 설계, DESIGN.md | Read, Glob, Grep, WebSearch | 기본 |
| `designer` | UI/디자인 | Read, Glob, Grep | 기본 |
| `orchestrator` | 팀 조율, 게이트 관리 | Read, Glob, Grep | 기본 |
| `investigator` | 조사/분석 | Read, Glob, Grep | 기본 |

> 각 에이전트는 역할에 필요한 **최소 권한**만 가집니다.
> reviewer는 코드를 수정하지 않고, security 에이전트는 패치를 시도하지 않습니다.

---

## 업계 비교

| 항목 | ai-rules | 일반적 접근 |
|------|----------|-----------|
| Git 워크플로우 제어 | 커밋/푸시/PR/배포를 독립 축으로 분리 | 코드 수정과 결합 |
| 위험 평가 | 가역성 기반 (R0/R1/R2) | 패턴 목록 또는 모호한 가이드라인 |
| 승인 모델 | 배치 범위 (P0~P3) | 작업당 개별 확인 (피로 유발) |
| 확인 마찰 | 3단계 (날짜 → 난수 → 직접 실행) | 단일 확인 |
| 야간 자율 실행 | idle 모드 (오류 3회 후 자동 종료) | 비활성화 또는 완전 차단 |
| 멀티 도구 | Claude Code + Cursor + Windsurf | 도구별 개별 설정 |
| 권한 경계 | 예외는 사람만 승인, 범위+시간 제한 | 형식적 |

---

## 설계 철학

- [Harness Engineering](docs/guide/HARNESS_ENGINEERING.md) — Advisory + Deterministic을 결합하는 이유
- [AI Risk Tiers](docs/guide/AI_RISK_TIERS.md) — R0/R1/R2 가역성 기반 위험 분류
- [AI Vibe Coding Guide](docs/guide/AI_VIBE_CODING_GUIDE.md) — AI 협업 단위 설계
- [Agent Operating Model](docs/guide/AGENT_OPERATING_MODEL.md) — 에이전트 운영 모델 (4개 평면)
- [Human Authority Model](docs/guide/HUMAN_AUTHORITY_MODEL.md) — 사람-AI 권한 경계
- [Agent Autonomy Comparison](docs/guide/AGENT_AUTONOMY_COMPARISON.md) — 업계 에이전트 모드 비교

---

## 라이선스

MIT — [LICENSE](LICENSE) 참조
