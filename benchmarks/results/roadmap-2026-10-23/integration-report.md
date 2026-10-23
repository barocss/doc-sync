# 순차 실행 통합 결과 — 2026-10-23

측정 당시 HEAD는 `8d0f887`이었다. 이 보고서는 그 위의 커밋 전 작업 트리를 대상으로 한다. 시작할 때 다른 작업의 모델·문단 DOM 재사용 WIP를 포함해 고정했고 보존 여부를 검사했다. 측정 당시에는 커밋·push하지 않았다. 이후 main 통합 전 최종 확인은 [HANDOFF §5.8](../../../HANDOFF.md#58-main-통합-전-최종-확인-2026-10-23)에 기록한다.

## 구현

- SyncClient의 안전한 한 글 블록 수신만 비교·검산한다. 구조, 오래된 동시 삽입, 새 토큰 의존 묶음, 여러 블록, 숨은 칸·가상 블록, undo/redo는 전체 경로를 유지한다. 검산과 전체 교체 fallback 계약은 그대로다.
- 256 UTF-16 단위를 넘는 text는 해당 줄의 캐시를 한 번 비운다. 글자마다 블록 배열을 복사하는 비용을 없앴다. 저장 ID·순서·wire·GC는 그대로다.
- 문자열 삽입 undo가 UTF-16 ID를 모두 기록한다. 다른 actor의 입력과 삭제는 유지한다. 모델 좌표 단위 차이 전체를 해결한 변경은 아니다.
- PmBinding은 Doc 객체와 version이 같을 때 내부 모델·PM 변환을 재사용한다. 선택·presence 콜백은 유지하고 snapshot/reset/IME 초안 교체는 별도로 감지한다.
- 명세 초안, 성질 시험, bounded 8복제본 장기 하네스와 8 shard nightly CI를 추가했다.

## 수신 비교 전후

| 초기 글자 수 | before p95 ms | after p95 ms | 전체 모델 읽기/이벤트 |
|---|---:|---:|---:|
| 10000 | 20.253 | 0.781 | 2 → 0 |
| 100000 | 186.249 | 1.174 | 2 → 0 |

문서 크기별 준비 5회와 본 표본 30회다. 동기 이벤트 수신부터 구독 콜백 종료까지이며 거울 적용·네트워크·DOM은 제외한다. 거울은 측정 밖에서 매번 검사했고 송수신 모델과 일치했다. fallback 0이다. 외부 부하가 같다는 보장은 없으므로 제품 SLO 승인으로 쓰지 않는다. 원자료는 `remote-events/`다.

큰 단일 붙여넣기 before는 120초 case 제한 안에 완료하지 못했다. after는 local 128.358ms, remote 113.309ms로 완료하고 모델이 일치했다. 이 둘은 각 표본 1개다. timeout을 지연 값이나 개선 배수로 바꾸지 않는다. 자세한 공통 대본과 작은 크기 교대 측정은 [기준 측정 보고서](report.md)에 있다.

## 실제 화면

키 이벤트 생성 시각부터 상대 DOM 확인 뒤 두 번째 rAF까지다. 물리 화면 표시 시각이 아니다. 초기 10만 자·625문단, 방향마다 준비 5개와 본 표본 30개다.

| headed Chrome | 캐시 전 p95 ms | 캐시 후 p95 ms |
|---|---:|---:|
| 데모 → PM | 573.2 | 291.0 |
| PM → 데모 | 361.2 | 259.8 |

전후 모두 실제 모델과 표시가 일치했다. after 준비 포함 70개 입력의 최종 모델·pending 0·fallback 0을 확인했다. 그러나 before는 외부 CPU 부하가 크게 늘었고 다른 시험도 겹쳤다. after는 우리 장기 작업이 끝난 뒤 실행했지만 외부 앱은 계속 실행됐다. 감소량을 PM 캐시만의 효과로 단정하지 않는다. 그보다 앞선 headless 관측 p95 270.0/271.6ms는 다른 모드이므로 이 표와 직접 비교하지 않는다. raw 데이터는 로컬 `output/playwright/roadmap-latency-*`에 있으며 Git에는 요약·소스 해시만 저장했다.

PM의 변화 없는 선택·presence에서는 모델 읽기와 변환이 반복되지 않는 것을 시험으로 확인했다. 실제 화면에는 여전히 수백 ms 지연이 남는다. 모든 경로 개선이나 제품 성능 목표 통과를 주장하지 않는다.

## 시험과 시점

| 근거 | 결과 | 범위 |
|---|---|---|
| 최종 기본 npm test | 코어 138 + 데모 10, 실패 0 | bulk·PM 캐시 포함 |
| 확장 FUZZ_SEEDS=3000 PM_SEEDS=300 | 코어 128 + 데모 10, 실패 0 | 큰 text 최적화·PM 캐시 추가 전 |
| 최종 PM 집중/300 seed | 19 통과 | cache·presence·PM 2/3복제본 |
| 최종 bulk 위치 집중 | 4 통과 | 반환 블록 불변, 위치·모델·snapshot·재전송 |
| compat 단위 | 31 통과 | adapter 입력·변환·진단 도구 |
| 최종 Chrome CDP | 입력 84 + 일반 회귀 20 통과 | OS 키보드 아님 |
| 연산 기록 | 30 확인 | 원래 입력 진단과 별도 |
| 로컬 장기 하네스 | 8 shard·각 8복제본, 총 1,000,021 wire Op 통과 | 약 512 Op 문서 묶음, CI 실제 실행 아님 |
| 타입 검사·별도 compat 번들 build | 통과 | 최종 소스 |

초기 reset 시험 timeout 한 번은 보존했다. HEAD 대조군·현재 원본 반복과 실제 5개 reset 수신 대기 보완 시험은 통과했다. 초기 원인을 제품 회귀로 확정하지 않았다. 최종 Z·모든 모델 일치·pending/failures 검사는 완화하지 않았다.

## 남은 게이트

30분 벽시계 1,800,060ms를 관측했지만 전체 1800 round와 1Hz cadence는 미달이다. 마지막 영속 수렴 checkpoint는 1320 round·엔진당 5280 edits다. 정확한 중단 시 round와 timer lateness는 모른다. 세 엔진과 검산을 한 프로세스에서 실행한 자료이므로 단일 엔진 실패로 귀속하지 않는다. 하네스는 종료 뒤 wall-clock 기준과 tick 기록을 고쳤고 8개 하네스 시험을 통과했다. 새 30분 재실행은 하지 않았다.

Yorkie 두 대형 case 미완료, 메모리 목표, 실제 목적 에디터·OS IME, lease 만료 복구, 운영 보호와 스키마 이전, 실제 CI 2주 관측은 남았다. G0/G1과 전체 로드맵은 완료가 아니다. 연속 저장·이진 형식·이동 정책은 기존 결정을 유지했다. [현황](../../../docs/roadmap-status.md)과 [HANDOFF](../../../HANDOFF.md)를 따른다.

실행 명령은 [stage0 README](../../stage0/README.md), `npm run remote --workspace @doc-sync/benchmarks -- --out results/새경로.json`, `node packages/doc-sync/test/long-fuzz.ts --ops 125000 --peers 8 --seed 1 --out output/새경로.json`이다. 로컬 최종 receipt는 `output/validation/roadmap-execution-20261023/validation.json`이다.
