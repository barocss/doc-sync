# 최종 paragraph 격리 후보의 경계 검증

최종 실행 `run-163002`과 bullet 단일 보완 `run-164136`은 **검사한 범위에서 통과**했다. 본 실행의 정지 화면 13쌍과 동일 baseline 반복 13쌍의 변경 픽셀은 모두 0이다. IME candidate→baseline→candidate의 세 비교도 모두 0이다. 보완 실행의 실제 bullet 겹침 화면쌍과 baseline 반복도 차이가 0이다. 앞선 광범위 `.blk` 후보의 실제 회귀와 fixture 실패 자료는 보존했다.

최종 제품 규칙은 다음과 같다.

```css
.surface > .blk.paragraph:not(:has(.composing)) {
    isolation: isolate;
}
```

top-level paragraph만 격리한다. heading, quote, list, nested cell/callout/image/caption은 격리하지 않는다. 합성 IME preview가 있는 top-level paragraph도 격리하지 않는다. 제품 소스는 root가 변경했다. 이 작업자는 소유한 검증 폴더만 변경했다.

## 증거

- 최종 상태와 소스 해시: `run-163002/summary.json`
- 브라우저 기능 결과와 geometry: `run-163002/browser-results.json`
- IME B→A→B 비교와 촬영 직전 상태: `run-163002/ime-cycle-comparison.json`
- 다음 블록과 실제 이름표 색의 겹침 표본: `run-163002/boundary-overlap.json`
- 각 정지 화면: `run-163002/*-{baseline,candidate,baseline-repeat}.png`
- 픽셀 차이: `run-163002/*-diff.png`
- 실행 당시 fixture: `run-163002/{seed-next.mjs,check-next.js,run-next.py,executed-check.js}`
- 자체 자원 정리: `cleanup.json`
- bullet 실제 겹침: `run-164136/summary.json`, `run-164136/marker-without-presence.png`, `run-164136/boundary-marker-direct-*.png`

실제 demo Editor/Doc/SyncClient/HTTP/SSE 서버와 별도 Chrome 세션을 사용했다. 이름이 긴 두 독립 클라이언트 C/D가 실제 presence를 보냈다. 임시 문서는 실제 schema로 생성했다. 서버는 동적 포트를 사용했다.

재현 명령은 다음과 같다. 현재 제품 소스가 최종 규칙과 같아야 같은 범위를 재현할 수 있다.

```sh
/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/playwright/screen-next-boundary-20261023/run-next.py
```

초기와 종료 시 8개 대상 소스 해시가 같았다. 최종 CSS SHA-256은 `8be763b66e6576f238a95d59bbb4a91c35de77c1788983ba3b657459411b9aec`다. 다른 제품 소스 해시는 summary에 있다.

## 시각 결과

모든 화면에서 baseline→candidate→baseline을 촬영했다. baseline은 검증 페이지에서만 `.surface .blk{isolation:auto!important}`를 적용했다. 각 촬영 뒤에는 candidate 스타일을 복원했다. 애니메이션 정지도 검증 페이지에만 적용했다.

| 화면 | candidate 차이 픽셀 | baseline 반복 차이 픽셀 |
| --- | ---: | ---: |
| 문단 경계의 기본 긴 이름표 | 0 | 0 |
| 표 첫 셀 둘째 줄의 기본 이름표 | 0 | 0 |
| 두 사용자의 전방/역방향 range 겹침 | 0 | 0 |
| 표 셀 경계의 nowrap 긴 이름표 | 0 | 0 |
| 같은 위치 두 caret와 nowrap 이름표 | 0 | 0 |
| top-level paragraph의 IME preview | 0 | 0 |
| 이미지와 빈 caption placeholder | 0 | 0 |
| divider | 0 | 0 |
| callout의 배경과 일반 문자 | 0 | 0 |
| 빈 문단 | 0 | 0 |
| 목록 블록의 일반 문자 | 0 | 0 |
| quote의 border와 일반 문자 | 0 | 0 |
| 표의 유색 배경과 문자 | 0 | 0 |

픽셀 비교 기준은 RGB 채널 차이 >12이다. 앞선 실패 이후 기준을 완화하지 않았다. source block rect, remote label rect, next block/descendant rect도 촬영 시점마다 저장했다. DOM 존재나 computed style만으로 시각 통과를 판정하지 않았다. PNG를 직접 확인했다.

표 nowrap 스트레스는 검증 페이지에만 `white-space:nowrap;width:max-content`를 적용했다. 첫 셀 둘째 줄 끝 근처에서 이름표가 오른쪽 셀의 유색 배경과 글 위로 넘어간다. 양쪽 모두 오른쪽 셀 위에 유색 이름표 픽셀 1,526개가 있다. 제품 기본 스타일의 이름표는 좁게 줄바꿈되므로 그 화면을 오른쪽 셀 넘김의 증거로 사용하지 않았다.

추가 7개 구조 화면은 이전 문단의 기본 긴 이름표가 다음 구조 영역과 겹치도록 배치했다. candidate의 다음 대상 내부에서 이름표 유색 픽셀을 확인했다: 이미지/placeholder 그릇 252개, caption placeholder 영역 186개, divider 213개, callout 378개, 빈 문단 278개, 목록 일반 문자 영역 200개, quote 245개, 표 339개. 이 값은 rect 교차 영역의 픽셀 표본이다. 이미지 등과 기존에 서로 가리는 순서는 전체 screenshot 차이 0으로 비교했다.

본 실행의 목록 fixture는 label x63.9..80과 bullet 영역 x35..53이 겹치지 않았다. 이 근거를 bullet 직접 겹침으로 확대하지 않았다. root 타이밍 종료 후 승인된 단일 보완 `run-164136`에서 source head를 1로 옮겨 실제 bullet과 label을 겹쳤다. label 없는 참조 screenshot의 실제 bullet 잉크 8픽셀이 label rect 안에 있음을 확인했다. 겹친 baseline/candidate/baseline-repeat의 화면 차이는 모두 0이었다. 이름표의 유색 픽셀도 세 화면에서 각각 828개로 같았다. 세 클라이언트 model은 같고 pending은 `[0,0,0]`이었다. 이 단일 보완 외 범위는 늘리지 않았다.

## 기능 결과

기능 검사 10개가 통과했다.

- 두 사용자의 range: C 3..17, D 7..21, 겹침 11자. 전방/역방향 결과가 같았다.
- 7개 구조(offscreen 문단, heading, quote, list, table, callout, wrap 문단): 스크롤, offset 4 hit test, 두 글자 선택, 실제 `z` 입력, undo.
- 합성 IME preview의 생성/업데이트/취소와 `isolate → auto → isolate` 전환. `가`, `가나다` preview 모두 auto였다.
- 합성 IME preview의 B→A→B 세 촬영은 문자열/rect가 같고 모든 픽셀 비교가 0이었다.

각 편집 이후 실제 클라이언트 3개의 model과 pending을 비교했다. 최종 서버 model도 같았다. pending은 `[0,0,0]`, 서버 sequence는 15였다. 이미지 2개의 렌더 존재를 확인했다. 이미지 편집·드래그 시험은 아니다. 합성 composition 이벤트를 사용했으므로 OS IME 검증도 아니다. 이 실행은 성능 측정이나 전체 main UI/네트워크 장애 시험으로 확대하지 않는다.

## 실패 자료와 잔차 분리

| 실행 | 결과 |
| --- | --- |
| run-161029 | viewport 설정 누락. fixture 실패 |
| run-161111 | wrap locator 오류. fixture 실패 |
| run-161531 | 전체 `.blk` 격리에서 IME 겹침 155픽셀 차이 발견 |
| run-161848 | B→A→B에서 155/155/0픽셀로 실제 칠 순서 회귀 확인. 원본 보고서는 `report.md` |
| run-162328 | composing 예외 후보. IME 차이 0. callout 상단 5픽셀 차이는 보존했고 최종 후보로 확대하지 않음 |
| run-162714 | 추가 표 때문에 strict locator가 두 셀을 찾음. fixture 실패 |
| run-162755 | 최종 selector. 12쌍 통과. 빈 문단 crop에 포함된 앞 callout 모서리 2픽셀은 A→B=2, B→A-repeat=0, A→A-repeat=2 |
| run-163002 | 스크롤 후500ms 정지. 같은 기준으로 모든 13쌍/반복쌍 차이 0. 최종 통과 |
| run-164136 | bullet 실제 잉크 8픽셀과 label rect 겹침 확인. 단일 화면쌍/반복쌍 차이 0. 보완 통과 |

run-162755의 2픽셀은 viewport `(38,448)`, `(36,450)`이었다. baseline `(214,162,122)`에서 candidate와 baseline-repeat 모두 `(227,190,162)`로 바뀌었다. 이름표나 빈 문단의 영역이 아니며 CSS 상태와 연결된 반복 차이도 아니다. 스크롤 직후 첫 촬영 잔차로 분리했다. 원자료를 삭제하거나 통과 값으로 덮어쓰지 않았다.

## 자원 정리와 판정 범위

모든 자체 Chrome 세션과 서버는 종료했다. 임시 DATA는 각 실행 폴더의 `server-data/`에 복사한 뒤 삭제했다. 사용자 서버·탭·프로세스는 변경하지 않았다. root에 Chrome 슬롯을 반환했다.

최종 후보는 이 controlled fixture의 실제 screenshot 비교와 기능 검사를 통과했다. OS IME, 전체 브라우저 통합 회귀, 최종 성능은 별도 근거가 필요하다.
