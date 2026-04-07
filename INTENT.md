# INTENT — 01-git ↔ 04-workflow stash 행동 충돌 해소

## 배경

`docs/research/moo-obsidian-vault.md` 분석에서 도출된 백로그 #1 (CRITICAL).
ai-rules가 sync한 글로벌 규칙 내부에 **에이전트 행동에 직접 영향을 주는 충돌**이 존재한다.

- **01-git.md (Pre-work Environment Check)**: dirty worktree 시 에이전트는 stash/reset/checkout 금지, 사용자 지시 대기
- **04-workflow.md (Failure Protocol, line 184)**: "Before any fix attempt: `git stash push -m ...`"

같은 세션에서 에이전트가 어느 규칙을 따를지 모호. 01-git이 우선순위 매트릭스상 상위지만, 04-workflow 본문은 stash를 능동 명령으로 적고 있어 컨텍스트 압박 시 후자로 드리프트할 수 있음.

## 왜 stash가 위험한가 (요약)

- staged/unstaged 혼재 시 stage 상태 손실 (pop이 복원 안 함)
- untracked 파일 누락 (`-u` 미사용 시)
- pop 충돌 → 01-git "conflict 자동 해결 금지" 위반 유발
- 다중 stash 인덱스 혼동 → 잘못된 항목 복원
- 사용자가 의도한 dirty 상태 파괴
- 대안: clean 상태면 stash 불필요, 정말 스냅샷 필요하면 **WIP 커밋**

## 결정

01-git을 단일 진실로 채택. 04-workflow Failure Protocol에서 stash를 능동 명령에서 **사용자 안내 전용**으로 격하.

## 변경 범위

- `core/rules/04-workflow.md` Lines 184~187 Failure Protocol stash 블록 재작성
  - 에이전트가 `git stash push`를 자동 실행하지 않음을 명시
  - 스냅샷이 정말 필요하면 **WIP 커밋** 권장 (`git commit -m "WIP: snapshot"`)
  - dirty 상태에서 fix 시작 자체를 멈추고 사용자 보고 (01-git Pre-work Check 재참조)
  - `stash drop` / `stash clear` 금지는 유지
- `core/rules/01-git.md`에 04-workflow와의 관계 1줄 cross-reference 추가 (선택)

## 변경 범위 외 (Out of scope)

- 01-git 본문 수정 (이미 정확함)
- 04-workflow 다른 섹션
- adapter / sync 엔진 변경
- 한국어 번역본 (`-ko.md`) — 영어 원본 머지 후 별도 작업

## 검증

- `node tools/sync.mjs --dry-run` (또는 프로젝트 표준 명령)으로 합성 결과 확인
- 변경 후 04-workflow line 184 영역에 능동 stash 명령이 남아있지 않은지 grep 확인
- 01-git Pre-work Check와 의미 충돌 없는지 양 파일 대조

## 가역성

R0 — 문서만 수정, git revert로 즉시 복구 가능.

## 다음 단계 (이 INTENT 범위 외, 백로그)

#2 Bootstrap AND 조건 (05+06 동시) → 별도 INTENT
#3 선택적 조립 경로 정렬
#4 sync 헬스체크 임계치 통합
