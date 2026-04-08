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
