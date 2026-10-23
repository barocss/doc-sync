# 데모 화면의 Paint·PrePaint 비용 개선 — 2026-10-23

기준은 main `f9370df85d93a69902254bbba5d6c90f95dc4559`와 앞선 [문단 모델 재사용 변경](../screen-latency-2026-10-23/report.md)의 미커밋 소스다. 앞선 원자료를 보존했다. 이번 추가 제품 변경은 `apps/demo/ui/style.css` 하나다. 코어·PM·SyncClient·전송·서버·동시편집 규칙과 공개 API는 이 단계에서 수정하지 않았다. 커밋·push하지 않았다.

## 원인과 최종 변경

현재 Chrome 입력 구간에서 Paint와 PrePaint 비용이 남았다. 일반 Change 경로에는 의도적인 전송 지연 타이머가 없었다. `/pm` ACK 지연·presence·GC·heartbeat 주기가 일반 Change를 버퍼링한다는 근거는 없다. 서로 다른 프로세스 시계나 브라우저 scheduling 대기를 순수 네트워크 지연으로 해석하지 않는다.

```css
.surface > .blk.paragraph:not(:has(.composing)) {
    isolation: isolate;
}
```

측정 대상인 최상위 일반 문단만 격리한다. 제목·목록·인용문과 표/상자 내부·이미지 캡션은 제외한다. 조합 미리보기가 있는 문단은 기존 `auto`를 쓴다. `:has()` 미지원 환경에서는 새 규칙 전체가 적용되지 않는다. 선택자 무효 처리 규칙은 [W3C Selectors §3.9](https://www.w3.org/TR/selectors-4/#invalid)를 따른다. 검증 Chrome에서 이 선택자와 `auto`↔`isolate` 전환을 확인했다. Paint/layout/size containment나 가상화·DOM 제거는 추가하지 않았다.

`isolation: isolate`는 새 stacking context를 만든다. [W3C Compositing and Blending](https://www.w3.org/TR/compositing-1/#isolation)을 따른다. 아래 성능 향상은 이 Chrome의 관측 결과이며 CSS 표준이 보장하는 속도가 아니다.

## 최종 전후 측정

Node 22.19.0, headed Chrome 156.0.8078.47, viewport 1440×1000, DPR 1이다. 같은 10만 자·625문단·문단당 160자와 첫 문단 offset 50의 ASCII 대본을 썼다. 실행마다 새 로컬 HTTP/SSE 서버와 JSONL 저장소를 썼다. 각 방향은 준비 5회와 본 측정 30회다. 두 편집기는 같은 페이지의 렌더러 스레드를 공유한다. 키 이벤트 생성부터 상대 DOM 확인 뒤 두 번째 rAF까지 측정했다. 물리 화면 표시 시각은 아니다.

| 방향 | 변경 전 p50 / p95 / 최대 | 최종 개선 p50 / p95 / 최대 | 변경 전 소스 최종 재실행 p50 / p95 / 최대 |
|---|---:|---:|---:|
| 데모→PM | 81.0 / 111.7 / 135.8ms | 35.9 / 69.5 / 74.1ms | 79.1 / 108.1 / 132.2ms |
| PM→데모 | 88.7 / 120.4 / 175.8ms | 45.4 / 68.5 / 72.5ms | 88.4 / 121.9 / 124.1ms |

첫 기준 대비 관측 p95 감소는 37.8%/43.1%다. 채택 근거 3실행의 준비 포함 210개 입력에서 두 클라이언트와 서버 모델이 같고 pending·fallback은 모두 0이었다. 변경 전과 최종 재실행의 제품 해시는 같다. 최종 개선의 제품 해시는 현재 소스와 같으며 전후 차이는 CSS 한 파일이다. 세 실행의 최초 JSONL seed도 같다.

시작→종료 1분 load average는 변경 전 53.68→40.72; 개선 15.62→10.23; 기준 재실행 10.50→9.45다. 외부 앱·기존 사용자 서버·탭을 유지했다. 타이밍 중 자체 회귀 시험과 다른 벤치마크는 실행하지 않았다. 초기 기준과 최종 후보 사이에는 실패 후보의 탐색·QA가 있었다. 최종 후보 뒤에는 동결한 변경 전 소스를 다시 측정했다. 외부 부하를 통제한 통계적 인과 실험이나 제품 SLO 통과로 해석하지 않는다.

`before/`, `after/`, `before-repeat-final/`에 입력별 raw, 요약, 소스 해시, 실제 문서 JSONL, 진단용 서버 이벤트, 실행 조건과 스크립트가 있다. `comparison.json`은 최종 3실행을 집계한다. 문서 JSONL에는 정식 측정 뒤 별도 trace 입력도 포함될 수 있다. 정식 70개 입력의 판정은 각 `browser-raw.json`의 샘플과 당시 서버 모델에 근거한다. Trace 입력은 p95에 섞지 않았다.

각 `measure.py`는 Node 22를 PATH에 두고 저장소 루트에서 실행한다. `DOCSYNC_MEASURE_OUT`, `DOCSYNC_SESSION`, 필요하면 `DOCSYNC_SOURCE_ROOT`를 새 경로로 지정한다. 실행 폴더의 템플릿과 `export-results.js`·`profile.js` 안의 절대 출력 경로도 새 경로로 맞춘다. 기존 결과에 덮어쓰지 않는다. 로컬 Playwright CLI wrapper와 설치된 Chrome을 사용한다. 실행 당시 절대 경로·임시 DATA·부하는 `run.json`에 있다. 최종 재실행은 보존한 baseline 사본과 그 패키지를 가리키는 별도 node_modules 링크를 사용했다.

## 최종 소스 Trace

정식 측정 밖에서 방향별 입력 3회를 기록했다. 입력부터 두 번째 rAF까지 메인 스레드 구간으로 자르고, 같은 종류의 중첩 이벤트는 구간의 합집합으로 계산했다. `#document`→`HTML` 중첩 Paint를 단순 합산하지 않는다. 종류 사이에는 중첩이 남으므로 아래 열을 더하지 않는다.

| 방향 | Paint 중앙값 전→후 | PrePaint 중앙값 전→후 | Layout 중앙값 전→후 |
|---|---:|---:|---:|
| 데모→PM | 29.856→13.674ms | 19.973→0.558ms | 9.601→7.381ms |
| PM→데모 | 30.331→19.890ms | 20.744→0.636ms | 10.204→10.614ms |

Paint clip/root가 크다는 이유로 10만 자 전부를 다시 칠했다고 단정하지 않는다. 초기 진단의 새 inline object 수는 약 232~236개로 변경 문단 길이와 비슷했다. 문단 DOM 생성과 layout 비용은 여전히 남는다. GPU 합성·물리 표시 시각·순수 네트워크 지연을 측정한 자료가 아니다. `*.trace.json.gz`, `*.cpuprofile.gz`는 원본 gzip이다. `analyze-trace.py`는 압축을 푼 trace 폴더를 받아 종류별 union 요약을 만든다.

## 회귀를 발견하고 제외한 후보

모든 `.blk`에 isolation을 적용한 첫 후보는 긴 이름표와 다음 heading의 조합 글자가 겹칠 때 칠 순서가 바뀌었다. 정지 상태 candidate→baseline→candidate에서 155픽셀 차이가 반복되고 candidate끼리는 0이었다. 이 후보를 채택하지 않았다. 당시 p95 93.7/108.3ms는 최종 성능값이 아니다. 원자료는 `after-rejected/`, `rejected-source.diff`, `rejected-boundary/`에 보존했다. 중간 후보의 callout 경계 5픽셀 차이도 보존했다. 단순히 z-index나 overflow를 추가하지 않고 최적화 범위를 줄였다.

최종 selector의 첫 확장 촬영에서는 callout 모서리에 2픽셀 잔차가 있었다. candidate와 baseline 재촬영은 같고 첫 baseline만 달랐다. 스크롤 후 500ms 정지한 동일 기준 재시험에서 13쌍과 baseline 반복 13쌍 모두 RGB 채널 차이 12초과 픽셀이 0이었다. 이 잔차를 이름표 가림으로 단정하거나 허용오차를 높이지 않았다. 실행 도구의 viewport·locator·결과 저장 경로 오류는 로컬 실패 기록으로 보존했고 최종 통과에 포함하지 않았다.

## 시험과 검증 범위

같은 코어·데모 TypeScript 소스에서 `FUZZ_SEEDS=3000 PM_SEEDS=300 npm test` 코어 144 + 데모 10, 실패 0이다. compat 단위 31, 타입 검사와 별도 compat 번들 빌드도 통과했다. 이후 CSS 범위를 좁혔고 최종 CSS는 Chrome에서 다시 검증했다.

- 기본 데모 Chrome 회귀 30건 통과: DOM 유지·polling·서식·undo/redo·구조·표·상자·Presence.
- compat Chrome CDP 입력 84건 통과. 일반 회귀 20건의 수렴·기대값을 확인했고 연산 기록 30건을 수집했다. 단순 종료 코드가 아니라 `passed` 84, `captured` 30, 최종 snapshot 검산 18, 진단 opt-in 검산 2를 확인했다.
- 경계 화면 13쌍과 baseline 반복 13쌍, 별도 IME B→A→B에서 RGB 채널 차이 12초과 픽셀 0. 조합 시작·갱신·종료의 auto↔isolate 전환과 기능 10건 통과. 서버와 클라이언트 3개의 모델·pending을 비교했다. 실제 OS IME 증거로 확대하지 않는다.
- 목록 기호 보완 시험에서 label 없는 참조의 bullet 잉크 8픽셀이 이름표 영역과 실제 겹쳤다. 전후·기준 반복의 변경 픽셀은 0, 이름표 유색 픽셀은 양쪽 828개다.
- 삭제·굵게 동시성 코어 probe 2건: `c` 삭제 vs `c` 굵게, `c` 삭제 vs `bc` 굵게. 두 도착 순서와 중복 전달에서 같은 모델이다. 전자는 `ab`, 후자는 남은 `b`만 굵게다. 브라우저 시험이나 새 정책 구현이 아니다.

`checks/`, `boundary/final-report.md`, `validation.json`에 근거를 둔다. 전체 브라우저 원본은 로컬 `output/playwright/screen-next-*20261023/`에 있다.

실제 OS 한글 입력기, 큰 표·경합 입력 성능, 메모리 목표, lease 만료 복구, 30분 1800 round·1Hz, G0/G1과 실제 CI 2주 관측은 이번 승인 범위가 아니다. 초기 모델 생성과 구조·되살리기·GC 뒤 전체 계산, 반환 복사·변환·DOM·layout·요청과 프레임 대기도 남는다. 기존 사용자 서버·탭·data에는 작업하지 않았고 이번 검증 서버·Chrome만 종료했다.
