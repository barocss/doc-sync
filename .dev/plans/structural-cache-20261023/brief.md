---
work_id: structural-cache-20261023
artifact_type: implementation-brief
status: done
owner_role: executor
source_request: 구조 변경 뒤 전체 재계산 병목 개선과 전후 성능 및 회귀 검증
last_updated: 2026-10-23
---

범위: Doc의 구조 연산 후 캐시 무효화. 원격 구조 이벤트는 기존 전체 검산을 유지한다.
제약: RGA, 동시 Enter 흡수, LWW, 삭제 ledger, undo/redo, hidden-cell 및 GC 규칙과 공개 API를 유지한다.
단순 대안: 모든 캐시 삭제를 유지한다. 현재 비용을 측정한 뒤 줄 단위 무효화로 범위를 줄인다. 같은 줄 내 표지 증분 알고리즘이나 새 저장 구조는 이번 범위에 넣지 않는다.
검증: 불변 baseline으로 1만/10만 자 구조 경로의 before/after/before-repeat 측정. 새 snapshot 모델과 이벤트 거울을 검산한다. 변경 없는 줄의 모델 재사용, 표 행/열/합치기 의존성, 죽은/중복/낮은 Ticket 연산, 숨은 줄, undo/redo를 회귀로 확인한다. 전체 fuzz 및 PM 시험, 비교 데모, 타입 검사, Chrome에서 구조 경로를 확인한다.
완료 기준: 현재 병목 재현, 유효 범위의 감소 근거, 기존 규칙 회귀 통과, 전후 원자료와 소스 해시 보존, HANDOFF 최신화. 제품 SLO와 실제 OS IME 판정은 하지 않는다. 커밋/push는 이번 요청에 없다.

결과: 제품 Doc 캐시 변경과 회귀 13개를 완료했다. 최종 전체 시험·Chrome 기능 회귀가 통과했다. 원본/최종/원본 반복 코어 원자료와 4개 Chrome 실행을 보존했다. 첫 수정본 Chrome 한 방향 p95 악화의 원인은 미분리 상태로 남긴다. 코어 개선을 화면 p95·SLO 통과로 확대하지 않는다. HANDOFF §5.16과 benchmarks/results/structural-cache-2026-10-23/report.md가 결과의 기준이다.
