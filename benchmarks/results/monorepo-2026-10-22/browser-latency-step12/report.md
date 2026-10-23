---
work_id: editor-latency-step12-20261022
artifact_type: performance-report
status: done
owner_role: executor
source_request: 모델 재사용과 문단 DOM 재사용을 단계별 적용하고 같은 10만 자 조건으로 재측정
last_updated: 2026-10-22 22:20 KST
---

# 모델·DOM 재사용 적용 결과

입력→상대 렌더링 프레임 p95는 데모 → ProseMirror에서 2,236.9ms → 288.1ms, 역방향에서 2,642.4ms → 238.7ms로 줄었다. 기존 대비 감소율은 각각 87.1%, 91.0%다. 준비 입력을 제외한 본 측정은 단계마다 양방향 각 30회다. 모든 입력과 최종 문서 일치 검사를 통과했다.

## 단계별 결과

단위는 ms다. 시작은 키 이벤트 생성 시각이다. 핸들러 실행 전의 대기를 포함한다. 종료는 상대 DOM 문자열 확인 후 두 번째 requestAnimationFrame 콜백이다. 물리 디스플레이의 표시 시각은 측정하지 않았다.

| 방향 | 상태 | p50 | p95 | 최대 | 기준 대비 p95 감소 |
| --- | --- | --- | --- | --- | --- |
| 데모 → ProseMirror | 최적화 전 | 1,722.4 | 2,236.9 | 2,251.9 | — |
| 데모 → ProseMirror | 1번: 모델 재사용 | 1,241.8 | 1,626.9 | 2,101.7 | 27.3% |
| 데모 → ProseMirror | 1+2번: 문단 DOM 재사용 추가 | 234.0 | 288.1 | 312.2 | 87.1% |
| ProseMirror → 데모 | 최적화 전 | 2,050.6 | 2,642.4 | 3,004.4 | — |
| ProseMirror → 데모 | 1번: 모델 재사용 | 1,253.6 | 1,593.9 | 1,959.6 | 39.7% |
| ProseMirror → 데모 | 1+2번: 문단 DOM 재사용 추가 | 207.1 | 238.7 | 239.3 | 91.0% |

| 방향 | 1번 p95 | 1+2번 p95 | 2번 추가 적용의 p95 감소 |
| --- | --- | --- | --- |
| 데모 → ProseMirror | 1,626.9 | 288.1 | 82.3% |
| ProseMirror → 데모 | 1,593.9 | 238.7 | 85.0% |

상대 DOM 반영까지만 본 p95는 최종 상태에서 데모 → ProseMirror 264.0ms, 역방향 188.1ms다. 종료점이 다르므로 위 프레임 수치와 구분한다.

## 1번: 모델 계산 재사용

`Doc.toJSON()`의 canonical 모델 계산을 문서별로 재사용한다. `apply()`와 `compact()`가 캐시를 비우고 version을 갱신한다. 문서가 바뀌지 않은 커서·Presence·상태 조회는 토큰과 서식을 다시 읽지 않는다.

반환하는 NodeJSON·run·attrs·marks 컨테이너는 별도로 복사한다. 호출자가 반환 모델의 구조를 고쳐도 다음 읽기와 내부 모델이 바뀌지 않도록 했다. 변경 전 읽기 결과도 이후 편집에 따라 바뀌지 않는다. CRDT 연산·순서·되돌리기·GC·스냅숏 형식은 변경하지 않았다.

1번만 적용한 소스와 원자료를 먼저 고정했다. 그 측정을 끝낸 뒤에만 2번을 적용했다.

## 2번: 문단 DOM 재사용

문단별 Block·서식 LWW 값·커서와 선택 표시를 비교한다. 같은 문단은 기존 DOM을 유지한다. 바뀐 문단과 선택 표시의 영향을 받은 문단만 다시 만든다. 표·상자 안의 문단도 같은 방식으로 갱신한다. 같은 문서·표시 상태의 중복 render 호출은 건너뛴다.

변경 없는 노드를 떼었다 붙이지 않도록 자식 순서만 조정한다. 입력 textarea는 유지한다. 전체 문서를 숨기거나 글자 수를 줄이지 않았다. 구조 변경 등 Block 캐시 전체가 무효화되는 경로에는 더 큰 범위의 재생성이 남을 수 있다.

## 병목 시간 변화

다음은 한 입력 관찰 구간의 메서드 포함 시간을 합한 뒤 구한 p50이다. 단위는 ms다. 메서드 사이에 포함 관계가 있으므로 행을 합치지 않는다.

| 방향 | 메서드 | 최적화 전 | 1번 | 1+2번 |
| --- | --- | --- | --- | --- |
| 데모 → ProseMirror | Doc.toJSON | 569.4 | 119.4 | 115.0 |
| 데모 → ProseMirror | Editor.render | 379.0 | 369.5 | 5.2 |
| ProseMirror → 데모 | Doc.toJSON | 866.0 | 120.3 | 115.2 |
| ProseMirror → 데모 | Editor.render | 372.2 | 354.9 | 5.2 |

`toJSON()` 호출 자체는 남는다. 비싼 전체 모델 재계산을 재사용한 것이며, 호출 횟수가 모두 사라진 것은 아니다. 데모 render의 누적 p50은 약 355~379ms에서 약 5.2ms로 줄었다.

아직 변경마다 한 번의 전체 canonical 모델 생성과 원격 전후 모델 비교·검산, ProseMirror 변환이 남는다. 이번에는 요청한 1번과 2번까지만 적용했다. 최종 p95가 239~288ms이므로 한 프레임 이내 입력 지연을 검증한 결과는 아니다.

## 조건과 검산

| 항목 | 조건 또는 결과 |
| --- | --- |
| 초기 문서 | 100,000자·625문단·문단당 160자. 초기 JSONL seed가 기존 자료와 바이트 동일 |
| 입력 | 같은 ASCII 키 순서. 첫 문단 초기 offset 50. 실제 trusted 키 이벤트 |
| 횟수 | 각 단계·방향별 준비 5회, 본 측정 30회, 별도 진단 1회 |
| 환경 | Node 22.19.0, Chrome 156, 1440×1000, devicePixelRatio 1 |
| 전송 | 실제 로컬 HTTP POST·SSE와 서버 JSONL 저장 |
| 1번 소스 검증 | 타입 검사 통과. FUZZ_SEEDS=3000 PM_SEEDS=300 npm test: 라이브러리 106 + 데모 10 통과 |
| 2번 소스 검증 | 타입 검사 통과. npm test: 라이브러리 106 + 데모 10 통과 |
| UI 검증 | 30개 항목 통과: 문단 DOM 유지, polling, 서식, undo/redo, 구조 분리, Presence·역방향·겹침·연결 종료, 표·상자·행/열·셀 합치기/나누기·새로 열기 |
| 문서 일치 | 각 단계 본 측정 60회 전부 통과. 최종 클라이언트 두 모델과 서버 모델 일치. 보낼 변경 0개. fallback 0 |
| 최종 크기 | 준비·진단을 합친 72회 입력 뒤 각 단계 100,072자·625문단 |
| 소스 분리 | 1번→1+2번의 소스 차이는 apps/demo/ui/editor.ts 하나. 각 단계의 소스 archive와 해시 보존 |
| Paint | 본 측정과 분리한 방향별 진단에서 DOM 반영 뒤 Paint 종료 확인 |

## 외부 부하와 중단 실행

| 상태 | 시작 전 load average | 종료 후 load average |
| --- | --- | --- |
| 1번: 모델 재사용 | 26.80 / 20.62 / 14.04 | 21.88 / 22.38 / 17.28 |
| 1+2번: 문단 DOM 재사용 추가 | 23.37 / 23.14 / 20.61 | 20.53 / 21.79 / 20.53 |

순서는 1분 / 5분 / 15분이다. 논리 CPU는 14개다. 외부 데스크톱 부하가 있었고 1번 초반에는 다른 채팅의 추가 호환성 검증이 겹쳤을 수 있다. 종료 통보와 각 실행의 부하 기록을 보존했다. 모든 시간 차이를 코드만의 효과로 단정하지 않는다. 모델 계산과 DOM 생성의 호출별 비용 감소도 함께 확인했다.

2번의 첫 실행은 디스크 ENOSPC로 후반부 저장이 중단됐다. 61개 표본을 보존하고 최종 비교에서 제외했다. 공간을 재확인한 뒤 같은 소스와 초기 seed로 전체를 한 번 다시 측정했다. 사용자 파일은 삭제하지 않았다. 최종 수치는 `step2-repeat`의 완주한 결과다.

측정 도구의 console 출력 파서도 텍스트 응답을 받도록 고쳤다. 이는 수집 후 출력 처리 수정이다. 키 입력, 대본, 프레임 종료점과 본 측정 30회 조건은 바꾸지 않았다.

## 해석 범위

한 페이지의 두 실제 편집기가 같은 렌더러 스레드를 공유한다. 다른 컴퓨터의 네트워크·표시 성능으로 확대하지 않는다. 물리 화면의 scanout은 측정하지 않았다. 각 단계의 단일 30회 실행은 통계적 동등성을 증명하지 않는다.

순차 ASCII 삽입 지연만 측정했다. IME·연속 타이핑 처리량·여러 사용자 경합·큰 표의 지연은 측정하지 않았다. 구조 변경·GC·되살리기처럼 Block 캐시를 전체 무효화하는 경로에는 전체 DOM 재생성이 남을 수 있다. UI 회귀 통과를 이 경로의 지연 통과로 해석하지 않는다.

## 파일

- [기준 원자료](../browser-latency-100k/browser-raw.json) · [전체 전후 수치·비율](comparison.json)
- 1번: [원자료](step1/browser-raw.json), [분석](step1/summary.json), [소스 archive](step1/source.tar.gz), [실행·부하](step1/run.json)
- 1+2번 최종: [원자료](step2-repeat/browser-raw.json), [분석](step2-repeat/summary.json), [소스 archive](step2-repeat/source.tar.gz), [실행·부하](step2-repeat/run.json)
- 중단 실행: [기록](step2/interrupted.json), [부분 원자료](step2/partial-browser-raw.json)
- 검증: [1번 확장 시험](step1-tests.log), [2번 기본 시험](step2-tests.log), [타입 검사](step2-typecheck.log), [UI 검증](step2-browser-validation.json), [표·상자·새로 열기](step2-browser-validation-nested.json)
- 변경 파일: [Doc](/Users/user/github/doc-sync/packages/doc-sync/src/crdt/doc.ts), [데모 렌더러](/Users/user/github/doc-sync/apps/demo/ui/editor.ts), [모델 재사용 시험](/Users/user/github/doc-sync/packages/doc-sync/test/model-cache.test.ts)
