# `.blk isolation:isolate` 경계 시험

판정: **시각 회귀로 승인 불가**. 기능 시험과 5개 정지 화면 쌍은 통과했다. 그러나 앞 문단의 긴 presence 이름표와 다음 heading의 조합 미리보기가 겹치면 칠 순서가 바뀐다. 제품 소스는 변경하지 않았다.

## 재현과 근거

최종 실행은 `run-161848`이다. 실제 demo `Editor`, `Doc`, `SyncClient`, `HttpTransport`를 사용했다. 별도 HTTP/SSE 서버, 임시 문서, Chrome 세션을 만들었다. 기본 스타일의 candidate와 검증 페이지에서만 `.surface .blk{isolation:auto!important}`를 넣은 baseline을 비교했다. 애니메이션은 검증 페이지에서만 정지했다.

재현 명령:

```sh
/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 output/playwright/screen-next-boundary-20261023/run.py
```

실패를 재현하면 명령은 종료 코드 1을 반환한다. 스크립트는 각 실행을 새 `run-HHMMSS` 폴더에 저장한다. 실행에 사용한 JS는 각 폴더의 `executed-check.js`이다. 초기 문서는 `seed.mjs`, 실행 후 서버 자료는 각 실행 폴더의 `server-data/`에 보존했다. 결과의 소스 해시는 `summary.json`에 있다. 최종 실행 중 8개 대상 소스의 해시는 바뀌지 않았다.

## 실제 시각 회귀

기본 제품 스타일에서 긴 이름표는 폭이 좁아서 세로로 줄바꿈된다. 둘째 문단에 C와 D의 커서를 같은 위치에 두고, 다음 heading에서 합성 조합 미리보기 `조합미리보기`를 표시했다. 앞 문단 D의 이름표가 다음 heading까지 내려온다.

candidate → baseline → candidate 순서로 다시 촬영했다. 매 촬영 직전에 조합 문자열과 rect, 모든 remote caret의 actor·이름·rect·pseudo 스타일을 저장했다. 이 상태는 세 촬영에서 같았다.

| 비교 | RGB 채널 차이 >12인 픽셀 | 결과 |
| --- | ---: | --- |
| candidate 0 → baseline 1 | 155 | 이름표와 조합 끝 글자의 칠 순서 변경 |
| baseline 1 → candidate 2 | 155 | 같은 영역에서 역방향 변경 |
| candidate 0 → candidate 2 | 0 | candidate 상태 반복 일치 |

화면 차이의 경계는 screenshot 좌표 `[149,52,162,73]`, viewport 좌표 `[169,107,182,128]`이다. candidate에서는 다음 heading의 끝 글자 `기`가 앞 문단의 D 이름표 위로 칠해진다. baseline에서는 이름표가 그 글자 위로 칠해진다. 조합 문자열과 geometry가 같고 B→A→B가 재현되므로 transient 또는 caret blink로 처리할 수 없다. 이름표를 올리는 임의 z-index나 overflow 변경은 하지 않았다.

- `run-161848/ime-cycle-comparison.json`: 세 촬영의 상태와 픽셀 비교
- `run-161848/ime-cycle-0-candidate.png`: candidate 첫 화면
- `run-161848/ime-cycle-1-baseline.png`: baseline 화면
- `run-161848/ime-cycle-2-candidate.png`: candidate 반복 화면
- `run-161848/ime-cycle-diff-0-1.png`: 변경 영역

따라서 `.blk`마다 stacking context를 만드는 후보는 현재 acceptance 조건인 “기존 이름표/조합 겹침의 칠 순서 보존”을 만족하지 않는다. 범위가 더 큰 격리 경계 또는 presence overlay 구조를 검토해야 한다. 그 대안의 성능이나 안전성은 이 시험에서 검증하지 않았다.

## 통과한 범위

| 정지 화면 쌍 | 변경 픽셀 | 가시성 근거 |
| --- | ---: | --- |
| 문단 경계 긴 이름표 | 0 | 양쪽 896 유색 픽셀, 문단 밖 351 픽셀 |
| 표 첫 셀 둘째 줄 기본 긴 이름표 | 0 | 양쪽 1,104 유색 픽셀. 기본 이름표는 이 위치에서 셀 밖으로 나가지 않음 |
| 두 사용자의 전방/역방향 range | 0 | 두 색상 모두 보존. C 범위 3..17, D 범위 7..21, 겹침 11자 |
| 표 셀 경계 nowrap 스트레스 | 0 | 양쪽 1,679 유색 픽셀. 오른쪽 유색 셀 배경/글 영역 위에 1,526 픽셀 |
| 같은 위치 두 caret/nowrap 이름표 | 0 | baseline과 동일하게 D가 C를 가림. D의 유색 픽셀 2,326개 보존 |

nowrap 스트레스는 검증 페이지에서만 `.caret.remote::after{white-space:nowrap!important;width:max-content!important}`를 적용했다. 제품 기본 스타일 시험과 구분했다. 셀 경계 시험은 첫 셀의 둘째 줄 끝 근처에서 수행했다. 기본 스타일 시험은 실제로 경계를 넘지 않았으므로 셀 밖 가시성의 근거로 사용하지 않았다.

7개 구조(offscreen 문단, heading, quote, list, table, callout, wrap 문단)에서 스크롤, offset 4 hit test, 두 글자 선택, 실제 `z` 입력, undo를 확인했다. 각 편집 후 실제 클라이언트 3개의 model과 pending 상태를 비교했다. 최종 서버 model도 같았으며 pending은 `[0,0,0]`이었다. 이미지 1개의 렌더 존재를 확인했다. 이미지 편집/드래그 시험은 하지 않았다.

모든 pair에서 block rect와 해당 block 안 remote label의 rect가 같았다. 이 geometry 결과를 실제 칠 순서가 같다는 근거로 확대하지 않았다. 합성 compositionstart/update/end로 preview 표시와 취소는 통과했다. OS IME 입력 검증으로 확대하지 않았다. 성능을 측정한 실행도 아니다.

## 이전 실패와 정리

- `run-161029`: viewport 설정 누락으로 fixture 실패. 제품 판정 없음.
- `run-161111`: wrapped 문단의 잘못된 locator로 fixture 실패. 제품 판정 없음.
- `run-161531`: 기능 완료. 기본 셀 이름표가 셀 밖으로 나가야 한다는 fixture 조건은 해당 화면에 맞지 않았다. 두 화면은 동일했다. IME 155픽셀 차이는 실제 회귀 후보로 보존했다.
- `run-161848`: 기본 셀의 잘못된 경계 가정을 분리하고 nowrap 스트레스 근거는 유지했다. B→A→B에서 실제 칠 순서 회귀를 확인했다. 전체 판정은 실패다.

모든 자체 Chrome 세션과 서버는 종료했다. 임시 DATA는 각 실행 폴더에 복사한 뒤 삭제했다. `cleanup.json`에 세션 종료 로그와 서버 종료 상태를 기록했다. 사용자 서버·탭·프로세스는 건드리지 않았다.
