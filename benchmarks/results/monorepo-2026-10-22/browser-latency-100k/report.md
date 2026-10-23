# 실제 편집기 10만 자 입력·원격 표시 지연 보고서

수집 종료: 2026-10-22 20:04 KST

## 결과

현재 `/pm` 화면의 10만 자 편집 지연은 크다. 브라우저가 생성한 키 이벤트부터 상대 렌더링 프레임 경계까지 p95는 데모 → ProseMirror 2.24초, 역방향 2.64초였다. 최대값은 각각 2.25초와 3.00초였다. 정확성은 유지됐지만, 이 결과로 실제 편집기 성능이 충분하다고 판단할 수 없다.

핵심 병목은 브라우저의 반복적인 전체 문서 변환과 데모 화면 재생성이다. 서버의 변경 처리 p95는 1.89~3.54ms였다. 전송 시작부터 원격 수신 콜백까지의 긴 시간을 네트워크 지연으로만 해석하면 안 된다. 해당 구간에는 브라우저 이벤트 처리 대기가 포함된다.

## 조건과 측정 기준

| 항목 | 조건 |
| --- | --- |
| 대상 | 실제 /pm 화면, 데모 A와 ProseMirror P, HTTP POST·SSE·JSONL 저장 사용 |
| 문서 | 시작 100,000자, 625문단, 문단당 160자 |
| 입력 | 첫 문단 50번 위치에서 ASCII 한 글자씩 삽입. 실제 trusted 키 이벤트 사용 |
| 횟수 | 방향별 준비 5회 + 본 측정 30회 + 진단 1회 |
| 간격 | 이전 표본의 상대 프레임 경계가 끝난 뒤 최소 120ms. 연속 타이핑 처리량 시험은 아님 |
| 브라우저 | Chrome 156.0.8078.47, headed, 1440×1000, devicePixelRatio 1 |
| 환경 | Node 22.19.0, macOS arm64, 논리 CPU 14개. 네트워크·CPU 속도 제한 없음 |
| 참여자 배치 | 한 페이지 안의 실제 편집기 2개. 같은 렌더러 스레드 공유 |
| 저장 | 기존 data/ 대신 /tmp/doc-sync-editor-latency-20261022 사용 |
| 소스 | 수집 준비 시 Git HEAD 02ec64e5e1b0a120114305c287072683c6f7002b; 현재 측정 관련 소스 33개 해시를 전후 확인 |
| 동시 시험 | 부모의 호환성 시험·IME 진단 종료를 확인한 뒤 본 측정. 외부 앱은 계속 실행 |

시작 시각은 키 이벤트의 `event.timeStamp`다. 따라서 이벤트가 핸들러에 도달하기 전의 브라우저 대기도 포함한다. 비교용으로 capture 핸들러 시작 시각도 따로 저장했다. 두 시각은 같은 브라우저의 단조 시간 축을 사용한다.

DOM 종료점은 MutationObserver가 상대 첫 문단의 정확한 문자열을 확인한 시각이다. 프레임 종료점은 그 뒤 두 번째 requestAnimationFrame 콜백이다. 이는 렌더링 기회를 지난 시점의 추정값이다. 물리 디스플레이의 실제 표시 시각은 측정하지 않았다. 두 방향의 별도 진단 trace에서 DOM 반영 뒤 Paint가 끝난 것을 확인했다.

코어·앱 파일은 수정하지 않았다. 브라우저와 서버의 메서드를 실행 중에 감싸 시간을 기록했다. 원래 메서드는 그대로 호출했다. CPU 샘플링과 trace는 본 측정에 포함하지 않은 별도 진단 입력에서만 켰다.

## 입력부터 상대 표시까지

단위는 ms다. p95는 정렬한 30개 값의 floor(0.95×30) 위치를 사용했다.

| 방향 | 종료점 | p50 | p95 | 최대 |
| --- | --- | --- | --- | --- |
| 데모 → ProseMirror | 상대 DOM 반영 | 1,221.7 | 1,717.0 | 1,730.2 |
| 데모 → ProseMirror | 상대 렌더링 프레임 경계 | 1,722.4 | 2,236.9 | 2,251.9 |
| ProseMirror → 데모 | 상대 DOM 반영 | 1,305.9 | 1,784.4 | 2,224.5 |
| ProseMirror → 데모 | 상대 렌더링 프레임 경계 | 2,050.6 | 2,642.4 | 3,004.4 |

capture 핸들러 시작부터 프레임 경계까지만 재면 p95는 각각 1,789.8ms와 2,559.8ms다. 이벤트 생성 시각을 사용한 위 표는 핸들러에 도달하기 전의 대기도 포함한다. 앞선 진행 보고의 수치와 이 차이를 구분해야 한다.

## 구간별 시간

각 칸은 평균 (p95)다. 단위는 ms다. 평균 구간 값은 전체 평균으로 합칠 수 있다. p95끼리는 합칠 수 없다. 서버 submit은 전송 구간 안의 별도 측정값이므로 합계에 더하지 않는다.

| 구간 | 데모 → ProseMirror | ProseMirror → 데모 |
| --- | --- | --- |
| 키 이벤트 생성 → capture 핸들러 | 126.9 (486.2) | 82.4 (495.1) |
| capture 핸들러 → 전송 시작 | 1.1 (1.4) | 233.1 (242.3) |
| 전송 시작 → 상대 수신 콜백 | 820.3 (873.8) | 820.6 (1,219.2) |
| 상대 수신 콜백 → 상대 DOM | 388.8 (421.3) | 298.2 (322.3) |
| 상대 DOM → 프레임 경계 | 497.0 (552.4) | 661.8 (906.2) |
| 서버 검사·적용·JSONL 저장 (별도) | 0.8 (1.9) | 1.2 (3.5) |

ProseMirror 입력은 전송을 시작하기 전부터 평균 233.1ms를 썼다. 전송 이후에도 같은 페이지의 긴 작업이 수신 콜백 실행을 늦췄다. 따라서 송신 처리, 상대 처리, 데모 관찰 화면의 비용을 함께 줄여야 한다.

## 병목 근거

다음 표는 한 입력의 관찰 구간에서 메서드별 시간을 합친 뒤 구한 p50이다. 괄호는 호출 횟수의 p50이다. 포함 시간은 서로 겹치므로 표의 행을 합치면 안 된다.

| 메서드 | 데모 → ProseMirror (ms) | ProseMirror → 데모 (ms) |
| --- | --- | --- |
| Doc.toJSON | 569.4 (10회) | 866.0 (15회) |
| Editor.render | 379.0 (3회) | 372.2 (3회) |
| SyncClient.withEvents | 328.8 (1회) | 0.2 (1회) |
| PmBinding.dispatch | 해당 없음 | 408.5 (1회) |
| Doc.apply | 0.3 (2회) | 0.4 (2회) |

1. **전체 문서 변환을 반복한다.** `Doc.toJSON()`은 보통 10회 또는 15회 호출됐다. 누적 p50은 569.4ms 또는 866.0ms였다. 이 함수는 모든 본문 블록에서 글자·서식을 다시 읽고 canonical 변환을 한다. CPU 프로파일에서도 `unitsToRuns`, `rawBlock`, 글자·서식 처리의 자기 시간이 컸다. [Doc.toJSON 소스](/Users/user/github/doc-sync/packages/doc-sync/src/crdt/doc.ts:1313), [unitsToRuns 소스](/Users/user/github/doc-sync/packages/doc-sync/src/crdt/model.ts:132).

2. **데모 화면을 통째로 다시 만든다.** `Editor.render()`는 보통 3회 호출됐다. 누적 p50은 379.0ms 또는 372.2ms였다. 현재 구현은 surface를 비운 뒤 10만 자의 span을 다시 만든다. 이후 스타일 계산·레이아웃·Paint도 발생한다. [데모 렌더 소스](/Users/user/github/doc-sync/apps/demo/ui/editor.ts:937), [surface 재생성](/Users/user/github/doc-sync/apps/demo/ui/editor.ts:1086).

3. **커서·상태 관찰이 전체 문서 작업을 다시 부른다.** `/pm`은 700ms마다 상태를 조회한다. 공통 render는 데모를 다시 만들고 양쪽 모델을 변환·직렬화한다. Presence 갱신도 ProseMirror 상태와 공통 화면을 갱신한다. 커서 장식 계산 역시 모델 전체를 읽는다. [주기적 조회와 공통 render](/Users/user/github/doc-sync/apps/demo/ui/pm-app.ts:176), [원격 선택 장식](/Users/user/github/doc-sync/packages/doc-sync/src/pm/binding.ts:398).

4. **원격 모델 이벤트 계산에도 전체 문서 비용이 있다.** 데모 → ProseMirror에서 `SyncClient.withEvents()`의 포함 시간 p50은 328.8ms였다. 이 경로는 전후 모델 생성, 비교, diff, 검산, 편집기 콜백을 포함한다. 그중 자식 계측 구간을 뺀 평균은 37.2ms였다. 328.8ms 전체를 diff 비용으로 해석하면 안 된다. [원격 모델 이벤트 소스](/Users/user/github/doc-sync/packages/doc-sync/src/sync/client.ts:105).

5. **단순 CRDT 적용과 서버 submit은 위 작업보다 작다.** 브라우저 `Doc.apply()` 누적 p50은 약 0.3~0.4ms였다. 서버 submit p95는 1.89~3.54ms였다. 이번 한 글자 입력 경로에서는 이 두 항목보다 전체 모델·화면 작업의 비용이 더 컸다.

## Paint·네트워크 진단

방향별 진단은 각 1회다. 다음 값은 capture 핸들러 시작을 기준으로 한다. 본 측정 30회의 통계와 섞지 않았다.

| 방향 | 상대 DOM 반영 (ms) | 첫 Paint 종료 (ms) | 프레임 경계 (ms) | DOM 이후 Paint 확인 |
| --- | --- | --- | --- | --- |
| 데모 → ProseMirror | 1,178.8 | 1,631.3 | 1,668.7 | 확인 |
| ProseMirror → 데모 | 1,220.1 | 1,426.6 | 1,489.0 | 확인 |

Paint 확인은 DOM 변경 후 브라우저가 그린 프레임이 있었음을 뜻한다. Paint 이벤트만으로 특정 픽셀의 물리 표시 시각을 증명하지는 않는다. 최종 스크린샷에서는 양쪽 첫 문단의 삽입 문자열과 수렴 상태를 확인했다.

| 방향 | POST 요청 → 응답 헤더 (ms) | 헤더 수신 → 렌더러 응답 이벤트 (ms) |
| --- | --- | --- |
| 데모 → ProseMirror | 80.6 | 712.0 |
| ProseMirror → 데모 | 3.1 | 668.4 |

응답 헤더는 도착했지만 렌더러의 응답 이벤트는 수백 ms 뒤 실행됐다. 이는 전송 구간에 브라우저 처리 대기가 포함됐다는 근거다. 이 값은 POST 응답 기준이다. SSE 전송 자체의 지연 분포를 따로 측정한 값은 아니다.

## 정확성·외부 부하·한계

본 측정 60회는 모두 trusted 입력이었다. 매 입력의 양쪽 첫 문단 문자열이 기대값과 같았다. 마지막에는 두 클라이언트의 전체 모델이 서버 모델과 같았다. 보낼 변경은 모두 0개였다. 준비·진단을 합친 입력 72회 뒤 최종 문서는 100,072자·625문단이었다. 모델 이벤트 fallback은 0이었다.

본 측정 시작의 load average는 10.71 / 14.62 / 15.21였다. 최종 분석의 값은 11.46 / 10.56 / 12.21였다. 순서는 1분 / 5분 / 15분이다. 외부 앱의 CPU 부하는 유지됐다. 따라서 이 값은 해당 로컬 환경에서의 결과다.

두 편집기는 같은 페이지와 렌더러 스레드를 공유한다. 다른 컴퓨터의 독립된 화면·네트워크 결과로 확대할 수 없다. 서버와 브라우저는 같은 컴퓨터를 사용했다. 순차 ASCII 삽입만 측정했다. IME 조합, 연속 입력 처리량, 나누기·합치기, 큰 표, 여러 사용자 경합은 대상이 아니다. 계측 래퍼와 DOM 관찰의 영향은 완전히 제거하지 않았다.

이 측정은 Presence 기능 변경 후의 현재 소스를 사용했다. 기존 모노레포 비교의 전후 원자료와 소스 시점이 다르다. 이 결과를 모노레포 전환의 속도 변화로 해석하지 않는다.

## 다음 작업

1. 같은 변경에서 모델을 한 번 만들고 재사용한다. 커서·Presence·상태 표시만 바뀔 때 전체 모델을 다시 만들지 않는다.
2. 데모 렌더러가 바뀐 문단의 DOM만 갱신하도록 한다. 같은 프레임의 중복 갱신을 모은다.
3. 원격 이벤트 계산과 ProseMirror 변환을 바뀐 블록으로 좁힌다. 기존 문서 일치·검산 규칙을 유지한다.
4. 같은 10만 자·양방향 30회 조건으로 다시 측정한다. 이후 별도 창 또는 별도 기기의 송수신 측정으로 범위를 넓힌다.

이번 작업은 측정과 보고서 작성이다. 위 최적화는 아직 적용하지 않았다.

## 원자료와 재현 도구

- [원시 브라우저 표본·최종 모델](browser-raw.json), [분석 수치·호출 횟수·구간 시간](summary.json)
- [서버 submit 기록](server-events.jsonl), [측정 방법](methodology.json), [소스 해시](source-manifest.json), [시작 시점 부하](measurement-start.json)
- 데모 → PM: [Chrome trace](demo-to-pm.trace.json), [CPU 프로파일](demo-to-pm.cpuprofile)
- PM → 데모: [Chrome trace](pm-to-demo.trace.json), [CPU 프로파일](pm-to-demo.cpuprofile)
- [브라우저 계측 도구](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/install-instrumentation.js), [표본 수집 도구](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/run-batch.js), [분석 도구](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/summarize.py)
- 스크린샷: [데모 → PM](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/demo-to-pm.png), [PM → 데모](/Users/user/github/doc-sync/output/playwright/editor-latency-100k/pm-to-demo.png)

측정은 별도 데이터 디렉터리에서 `server-launch.mjs`로 원래 데모 서버를 실행해 재현한다. Playwright CLI의 `run-code`로 계측 도구를 설치한다. `prepare-direction.js`로 첫 문단의 커서를 정한다. `run-batch.js`를 준비 5회와 본 측정 30회로 실행한다. 방향마다 별도 진단을 1회 실행한다. 원자료를 내보낸 뒤 `summarize.py`로 분석한다. 기존 결과·진단 파일이 있으므로 재현 시에는 새 출력 경로를 사용해야 한다.
