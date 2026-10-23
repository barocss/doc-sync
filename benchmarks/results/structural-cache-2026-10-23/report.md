---
work_id: structural-cache-20261023
artifact_type: performance-and-regression-report
status: done
owner_role: executor
source_request: 구조 변경 뒤 전체 재계산 병목 개선 및 전후 성능과 회귀 검증
last_updated: 2026-10-23
---

# 구조 변경 뒤 문단 재계산 개선

기준 main은 `10dfd860f23e0cc6eb92f67c2d9b710386c7c2ba`다. 이번 작업은 미커밋 상태이며 커밋·push는 요청하지 않았다.

## 원인과 변경

구조 연산은 모든 줄의 블록·위치·가시성·raw 문단·정규화 문단 캐시를 지웠다. 본문 10만 자와 중첩 글 600자가 있는 문서에서 작은 구조 변경마다 서식을 100,600회 다시 읽었다.

`Doc.apply()`의 연산 적용과 LWW·삭제 ledger는 유지한다. 실제 노드 삽입, 삭제·복원의 생존 전환, 이긴 노드 속성 쓰기에서 해당 줄을 무효화한다. 행·열 연산은 표가 있는 부모 줄을 무효화한다. 자손과 숨은 칸의 가시성 캐시는 전체 무효화한다. GC는 이전처럼 전체 캐시를 비운다.

무효화한 줄의 직전 캐시 하나를 다음 재계산까지만 보관한다. 블록 경계는 기존 전체 스캔으로 다시 계산한다. 비가상 글 블록의 marker·type·attrs·글자 순서·흡수 표지가 모두 같을 때만 기존 TextBlock과 문단 모델을 재사용한다. 대기 중 글자·inline 속성 쓰기는 직전 캐시의 해당 raw 모델도 무효화한다. 목록·표·흐름 정규화와 반환 모델 복사는 유지한다. 원격 구조 이벤트도 기존 전체 diff·검산을 유지한다.

## 코어 측정

Apple M3 Max·14 logical CPU·36 GiB RAM·macOS Darwin 24.6.0, Node 22.19.0 (`host.json`). 1만/10만 본문 자 + 상자·표 글 600자, 160자 문단. 수신부터 SyncClient 모델 이벤트 콜백 종료까지의 동기 처리다. 네트워크·거울 적용·DOM은 제외한다. 각 사례 5회 준비 + 30회 측정 + 계측용 2회다. 계측용 서식 카운터는 시간 표본에 넣지 않았다. p95는 정렬한 30개 중 인덱스 29다. 표본 수가 작으므로 p50·max·모든 표본도 JSON에 보존했다.

동일 대본으로 원본 → 수정 → 원본 재실행을 수행했다. 최종 제품의 타입 표시 수정 뒤 `after-final.json`으로 다시 측정했다. `after.json`은 타입 표시 수정 전 중간 자료이며 최종 표에 쓰지 않았다. 원본은 임시 디렉터리의 사본을 import하며 원본 SHA·파일 해시는 baseline manifest에 고정했다. baseline 하네스는 제품 import 경로만 바꿨고 양쪽 하네스 해시와 사본을 보존했다.

| 본문 자 | 사례 | 원본 p95 ms | 최종 p95 ms | 원본 재실행 p95 ms | 최종 서식 조회 2회 |
|---:|---|---:|---:|---:|---|
| 10000 | root-split | 15.709 | 6.760 | 18.066 | [160, 160] |
| 10000 | callout-split | 18.966 | 5.679 | 20.635 | [120, 120] |
| 10000 | root-type | 21.589 | 6.134 | 15.500 | [160, 160] |
| 10000 | cell-split | 24.663 | 5.697 | 15.291 | [120, 120] |
| 10000 | table-row | 18.649 | 6.717 | 17.945 | [0, 0] |
| 10000 | table-span | 15.417 | 6.316 | 16.512 | [0, 0] |
| 100000 | root-split | 169.830 | 63.493 | 198.613 | [160, 160] |
| 100000 | callout-split | 292.377 | 62.117 | 179.840 | [120, 120] |
| 100000 | root-type | 160.939 | 115.216 | 160.756 | [160, 160] |
| 100000 | cell-split | 183.373 | 46.512 | 156.163 | [120, 120] |
| 100000 | table-row | 214.140 | 72.644 | 162.050 | [0, 0] |
| 100000 | table-span | 226.743 | 101.239 | 167.302 | [0, 0] |

12사례 × 3실행 = 1080개 시간 표본, 준비 180회, 별도 서식 계측 72회다. 모든 1332 Change에서 콜백 1회와 고정 EditOp 기대 모델, 수신 이벤트 거울, 송수신 모델, 새 snapshot 모델의 동치를 확인했다. 준비·검산은 시간 표본 밖이다.

이번 변경은 줄의 전체 토큰 스캔을 제거한 것이 아니다. 같은 줄의 구조 변경은 경계를 다시 읽고, 문서 전체의 모델 복사·diff와 표 정규화도 남는다. 외부 앱 부하는 통제하지 않았으며 각 실행의 load average와 시각을 저장했다. 제품 SLO·G0/G1·메모리 개선의 증거가 아니다.

## Chrome 및 회귀

Chrome 156.0.8078.47, headed, 10만 자 625문단의 `/pm`에서 실제 키 이벤트를 넣었다. 방향마다 6회 준비와 30회 측정을 했다. Enter·Backspace를 번갈아 입력한다. 키 이벤트의 timestamp에서 두 편집기 DOM이 예상 문단 수·내용과 같아지고 두 번째 rAF를 지날 때까지다. 네트워크·에디터·DOM을 포함한다. 물리 디스플레이 표시와 실제 OS IME는 측정하지 않았다. p95는 30개 중 인덱스 28이다. 코어 표와 다른 구간이며 직접 비교하지 않는다.

| 실행 | 방향 | p50 ms | p95 ms | max ms |
|---|---|---:|---:|---:|
| before-v2 | demo-to-pm | 539.6 | 601.7 | 616.4 |
| before-v2 | pm-to-demo | 515.4 | 598.0 | 598.9 |
| after | demo-to-pm | 438.2 | 771.1 | 775.7 |
| after | pm-to-demo | 396.9 | 435.5 | 436.2 |
| before-repeat | demo-to-pm | 548.3 | 605.2 | 645.2 |
| before-repeat | pm-to-demo | 516.7 | 553.3 | 618.6 |
| after-repeat | demo-to-pm | 425.5 | 467.3 | 478.8 |
| after-repeat | pm-to-demo | 394.3 | 452.9 | 463.5 |

`before-v2`가 첫 완주 원본이다. 최초 `before`는 에이전트가 초기화 대기로 판단해 자기 세션을 조기 종료했다. 그 부분 표본은 모두 제외했으며 로컬 로그를 보존했다. 네 번의 완주 실행은 같은 설치·키 입력 batch JS 해시를 썼다. 소스와 실제 JS 해시는 `browser/binding.json`, 실행별 `sources.json`에 있다. 전체 표본 288개 중 시간 표본 240개와 준비 48개를 모두 보존했다. 모든 표본은 trusted 키 이벤트와 양쪽 예상 DOM을 확인했다. 실행 끝에 두 클라이언트와 서버의 전체 모델 동치, 고정 625×160자 최종 모델, pending 0·fallback 0을 확인했다. 생성한 서버·브라우저 세션을 종료하고 포트 닫힘을 확인했다.

**화면 결과의 한계**: 중앙값은 두 수정본 실행 모두 줄었다. PM→데모 p95도 두 번 줄었다. 데모→PM의 첫 수정본 p95는 601.7→771.1ms로 악화했으며 수정본 반복은 467.3ms였다. 이 실패 방향을 평균으로 숨기거나 외부 CPU·GC 탓으로 확정하지 않는다. 첫 수정본의 마지막 6개 표본은 628.6~775.7ms였고, 키→DOM 구간은 617~748ms, 이후 프레임 구간은 12~43ms였다. 긴 지연의 구체 원인은 이 계측만으로 분리하지 못했다. 따라서 코어 문단 재계산 감소는 확인했지만 화면 p95가 항상 개선되거나 SLO를 충족했다고 판정하지 않는다. 첫 원본 시작 load average가 약 110, 수정본 반복은 약 7로 달랐다는 한계도 원자료에 남긴다. 다른 사용자 앱·서버·탭은 중지하지 않았다.

최종 소스로 `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` 코어 246 + 데모 10, compat 단위 31, Stage0 Ours·Yjs 6, 타입 검사, 독립 compat 번들 빌드가 통과했다. 실패·skip·todo는 0이다. Yorkie는 이번 실행에 포함하지 않았다. Chrome 기본·중첩·Presence·다중 글 블록 40단계, compat 입력 84개 + 일반 회귀 20개(수렴 18·probe 2)와 연산 기록 30개를 확인했다. 입력은 CDP 조합을 포함하며 실제 OS IME 판정이 아니다. 상세 로그는 `output/validation/structural-cache-20261023/`, 화면·JSON은 `output/playwright/structural-cache-{main,compat}-20261023/`에 있다. 집중 13개는 전체 스냅숏 모델·위치·가시성 검산, 상자/칸/본문 split·merge, 행/열 삭제·복원·추가, 숨은 칸 서식, 부모 삭제 중 원격 편집, 재계산 대기 중 mark·inline 속성, 큰 삽입·삭제/복원·GC, 중복/낮은 Ticket, 동시 Enter 대표 교체, 다른 사용자 입력·서식을 보존하는 구조 undo/redo를 확인한다.

최초 진단 실패도 `output/validation/structural-cache-20261023/`에 보존했다. benchmark의 cell-type 반복은 목록 묶음 경로를 잘못 사용해 `0 !== 1`이 발생했다. cell-split 반복으로 고친 뒤 원본/수정본 비교를 시작했다. 집중 시험의 숨은 부모에 대한 로컬 명령과 없는 `client.edit()` 호출 2개는 시험 하네스 오류였다. 숨기기 전 만든 원격 연산과 실제 `doc.edit()+commit()` API로 수정했다. 타입 검사 오류는 좁혀진 TextBlock 변수와 inline Run의 명시적 판별로 수정했다. 이 실패를 기존 CRDT 정책 변경으로 처리하지 않았다.


## 재현

```sh
node --test packages/doc-sync/test/structural-cache.test.ts
node benchmarks/structure.ts --chars 10000,100000 --samples 30 --label current --out /tmp/new-structure-result.json
FUZZ_SEEDS=3000 PM_SEEDS=300 npm test
npm test --prefix apps/demo/compat
npm run typecheck
node --expose-gc --test benchmarks/stage0/workloads.test.mjs
```

Node 22.18 이상을 사용한다. 결과 파일은 기존 파일을 덮어쓰지 않는다. `baseline-source.tar.gz`, `baseline-harness.ts.txt`, `harness.ts.txt`, `harness-binding.json`으로 실제 실행 소스를 확인한다.

브라우저 대본은 다음처럼 다시 실행한다. 새 출력 폴더를 지정한다. runner와 템플릿은 Git에 보존했다. `executed-runner.py.txt`는 측정 때의 runner이며, `measure.py`는 템플릿을 자기 폴더에서 읽도록 경로만 바꾼 재현용이다.

```sh
python3 benchmarks/results/structural-cache-2026-10-23/browser/measure.py "$PWD" /tmp/new-structure-chrome current
```

원본 브라우저 소스는 `baseline-browser-source.tar.gz`에 있다. 새 임시 폴더에 풀고 이 저장소의 설치된 `node_modules`를 연결한다. 서버의 Node import만 사본 소스를 가리키도록 바꿨으며, 브라우저는 사본 서버가 제공하는 원본 라이브러리·동일 UI를 읽는다. 라이브러리 소스는 manifest의 원본과 같다. 의존성 lock 해시는 `dependencies.json`에 있다.
