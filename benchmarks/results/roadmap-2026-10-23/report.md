# Stage 0 기준 측정: 관측 종료

작성: 2026-10-23T05:30:43.422337+00:00
최종 갱신: 2026-10-23T05:49:48.082025+00:00

**상태: 30분 벽시계 관측 종료. 1Hz 목표 및 전체 1800 round는 미완료다. G0는 미승인이다.**

## 고정한 소스

- 시작 HEAD와 당시 미커밋 WIP를 baseline-manifest.json, baseline-working-tree.diff, baseline-source.tar.gz에 보존했다. 코어 측정은 이 사본을 사용했다.
- 새 bulk-text 최적화의 after 측정은 after-bulk-source/에 별도 소스와 SHA를 보존했다. Before와 after를 같은 소스라고 표시하지 않는다.
- Node 22.19.0, Yjs 13.6.33, Yorkie Tree 0.7.25. Yorkie는 공식 npm 패키지를 /tmp에 설치했다. 루트 lock과 다른 SDK 저장소는 수정하지 않았다.

## 공통 하네스 결과

| 작업 | 엔진 | 상태 | local p95 ms | remote p95 ms | open+첫 모델 p95 ms |
|---|---|---|---:|---:|---:|
| typing-10000 | ours | 모델 검산 통과 | 0.224 | 0.006 | 13.868 |
| typing-10000 | yjs | 모델 검산 통과 | 0.008 | 0.010 | 0.409 |
| typing-10000 | yorkie-tree | 120초 case 제한 초과; 미완료 | — | — | — |
| paste-100000 | ours | 120초 case 제한 초과; 미완료 | — | — | — |
| paste-100000 | yjs | 모델 검산 통과 | 0.570 | 0.220 | 0.734 |
| paste-100000 | yorkie-tree | 모델 검산 통과 | 2.742 | 0.379 | 1.088 |
| mixed-10000chars | ours | 모델 검산 통과 | 0.061 | 0.010 | 18.960 |
| mixed-10000chars | yjs | 모델 검산 통과 | 0.018 | 0.017 | 2.877 |
| mixed-10000chars | yorkie-tree | 모델 검산 통과 | 0.272 | 0.068 | 28.560 |
| open-after-10000edits | ours | 모델 검산 통과 | 0.131 | 0.003 | 12.174 |
| open-after-10000edits | yjs | 모델 검산 통과 | 0.009 | 0.010 | 0.617 |
| open-after-10000edits | yorkie-tree | 120초 case 제한 초과; 미완료 | — | — | — |
| table-50x10 | ours | 모델 검산 통과 | 0.059 | 0.015 | — |
| table-50x10 | yjs | 모델 검산 통과 | 0.071 | 0.073 | — |
| table-50x10 | yorkie-tree | 모델 검산 통과 | 0.418 | 0.209 | — |

- 15개 case 중 12개가 완료했다. 세 timeout은 성능 수치가 아니다. SDK 또는 코어의 단일 연산 시간이라고 해석할 수 없다.
- 100k paste는 local/remote 표본이 각 1개다. p95라는 필드 이름은 분포의 근거가 되지 않는다.
- open은 5회 측정한 snapshot load + 첫 텍스트 모델 읽기다.
- table은 고정 50×10칸에서 4 peer가 1000번 편집했다. 독립 문자열 모델, 같은 칸 동시 삽입, 겹친 삭제를 검산했다. 행·열 변경, 병합, undo, 동시 Enter의 엔진 간 정책은 비교하지 않았다.

## bulk-text 수정 후

- 단일 100k paste: local 128.358ms, remote 113.309ms, snapshot+첫 모델 open p95 235.161ms. local/remote/snapshot 모델 검산 통과.
- Before가 case timeout이므로 100k 개선 배수는 계산하지 않는다.
- 작은 크기의 같은 작업을 3회씩 교대로 실행했다. 공유 CPU에서 얻은 작은 표본이다.

| 글자 수 | before local p50 ms | after local p50 ms | p50 비율 |
|---:|---:|---:|---:|
| 1000 | 87.919 | 4.065 | 21.63× |
| 5000 | 342.479 | 3.745 | 91.45× |
| 10000 | 1539.747 | 12.851 | 119.82× |

## 30분 관측 결과

- 원본 시작: 2026-10-23T05:14:32.777Z. 관측 종료: 2026-10-23T05:44:32.830Z.
- 실제 관측 시간: 1,800,060ms. 최소 30분의 벽시계 관측을 확인했다.
- 마지막 영속 수렴 checkpoint: 1320 round, 엔진마다 5280 edits. 세 엔진 각각 4 replica가 이 checkpoint까지 수렴했다.
- 이 checkpoint의 elapsed는 1,759,999.782ms다. 예정 완료 시각보다 439,999.782ms 늦었다. 이 초과에는 round 처리 시간이 포함되므로 순수 tick lateness가 아니다.
- 원본은 매 60 round만 progress를 저장했다. 정지 시점의 정확한 메모리 내 완료 round와 타이머 지연 표본은 알 수 없다. 마지막 checkpoint 이후 round를 완료했다고 주장하지 않는다.
- 목표 1800 round와 1Hz cadence는 통과하지 못했다. `window-observation.json`과 `failure.json`에 미완료로 기록했다. `complete.json`은 없다.
- 기본 하네스는 세 엔진과 모델 검산을 같은 프로세스에서 순차 실행한다. 일정 미달을 우리 단독 엔진의 SLO 실패로 판정하지 않는다.
- 최초 CLI는 고정 round를 모두 마칠 때까지 실행하는 구조였다. 30분 대본의 뜻을 유지하기 위해 통합 담당 지시에 따라 원본 PID 78810만 종료했다. 다른 작업자 또는 사용자 프로세스는 종료하지 않았다.
- 원본 코어는 실행 전 SHA와 archive로 고정했다. 최초 하네스 소스는 당시 도구 입력에서 복원했다. 시작 시점 파일 SHA를 캡처한 자료는 아니다. 초기 receipt의 GC 문구는 지나치게 넓다. 최초 Yorkie wrapper는 기본 GC 옵션이었고, 이 대본은 삭제 없는 삽입만 수행했다. 보정 설명은 원본 source manifest에 남겼다.
- `paced-real-30min-ticks/`는 중복 측정을 피하라는 통합 담당 지시에 따라 중단했다. 부분 tick 기록과 취소 이유를 보존했다. 이 run도 통과 자료가 아니다.

## 향후 실행 하네스 수정

- 원본 프로세스를 종료한 뒤 CLI를 벽시계 window 기준으로 수정했다. deadline 뒤에는 새 round를 시작하지 않는다. 이미 시작한 round만 원자적으로 마친다.
- 실제 완료 round, 매 tick 예정·실제 시각, 지연 횟수, 마지막 round 완료 시각, window 초과를 저장한다. cadence 미달이면 미완료 receipt와 종료 코드 2를 남긴다.
- 과부하를 주는 제어 fixture가 고정 round 전체를 실행하지 않고 window를 닫는지 검사했다. 하네스 시험 8/8 통과. 제어 fixture 시간은 CRDT 성능 측정값이 아니다.
- 수정된 CLI의 짧은 실제 Ours smoke는 300ms window, 3 round, 12 edits를 검산했다. 이는 30분 재검증이 아니다. 추가 30분 실행은 하지 않았다.

## 증거의 범위와 G0

- 이는 같은 프로세스에서 수행한 CRDT + wrapper 측정이다. 브라우저 렌더링, 네트워크, 인증, Yorkie 서비스 또는 운영 장애 복구를 측정하지 않는다.
- Ours는 JSON, Yjs는 binary update, Yorkie는 protobuf 객체 변환과 local acknowledgement를 포함한다. wrapper 비용은 동일하지 않다.
- 혼합 split/merge 대본은 순차 실행이다. Ours는 block marker, Yjs wrapper는 뒤쪽 텍스트 삭제·재삽입, Yorkie는 native Tree split/merge를 쓴다. 같은 순차 모델은 동시 Enter의 토큰 정체성이나 의도 규칙 동등성을 증명하지 않는다. 기존 Ours 동시 Enter 규칙은 변경하지 않았다.
- Yorkie 실제 wire bytes는 측정하지 않아 null이다. snapshot은 실제 저장 bytes다.
- heap delta는 GC와 allocator, clone, cache 영향을 받는다. 제품 RAM 상한이나 Yjs 대비 2배 목표의 승인 근거로 사용하지 않는다.
- CRDT GC 조건도 다르다. Ours는 명시적 Doc.gc 호출이 없고, Yjs는 기본 GC를 쓰며, Yorkie는 서비스 frontier가 없어 GC를 끈다. 저장 크기와 heap은 같은 GC frontier의 효율 비교가 아니다.
- 개별 편집 지연의 제품 목표, 메모리 목표, 엔진별 구조 정책 차이 및 30분 작업 결과를 확인해야 G0를 결정할 수 있다. 현재 G0는 미승인이다.

## 시험

- 원본 소스와 bulk-text 수정 후 소스에서 각각 기존 하네스 시험 7/7 통과. wall-clock 수정 후 제어 fixture를 포함한 시험 8/8 통과.
- freeze CLI의 소스 보존·manifest·복사된 import 검증 통과.
- 전체 프로젝트 시험과 원격 이벤트 전후 성능은 통합 담당의 별도 결과를 따른다.

재현 방법: [stage0 README](../../stage0/README.md)

진단 CPU profile: `profiles/paste-before-after.cpuprofile`. baseline의 `doc.ts:766` anonymous frame과 `charAdded` frame이 지배했다. sampled CPU 결과는 승인 타이밍 수치와 분리했다.
