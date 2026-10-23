# Stage 0 기준 측정: 중간 보고

작성: 2026-10-23T05:30:43.422337+00:00

**상태: 30분 cadence 실행 중. G0 통과 또는 제품 성능 승인 근거가 아니다.**

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

## 30분 작업

- paced-real-30min/이 원본이다. 1초마다 4 actor가 같은 이전 문서의 끝에 한 글자씩 넣는다. 각 round의 4 replica 수렴을 검사한다. 1800 round를 목표로 한다.
- 실제 시간으로 실행한다. 처리 비용이 1초를 넘으면 실제 종료 시간이 30분을 넘는다. 완료 전에는 endurance 통과로 표시하지 않는다.
- 기본 일정 대비 지연 p50/p95/max와 실제 전체 소요 시간을 완료 receipt에 남긴다. 매분 progress와 30초 간격 외부 CPU 부하도 보존한다.
- 첫 run의 하네스 소스는 최초 도구 입력에서 복원했다. 시작 시 파일 SHA를 캡처한 자료는 아니다. 코어 사본과 그 SHA는 시작 전에 고정했다.
- paced-real-30min-ticks/는 중복 측정을 피하라는 통합 담당 지시에 따라 중단했다. 부분 tick 기록과 취소 이유를 보존했다. 원본 run은 중단하지 않았다.

## 증거의 범위와 G0

- 이는 같은 프로세스에서 수행한 CRDT + wrapper 측정이다. 브라우저 렌더링, 네트워크, 인증, Yorkie 서비스 또는 운영 장애 복구를 측정하지 않는다.
- Ours는 JSON, Yjs는 binary update, Yorkie는 protobuf 객체 변환과 local acknowledgement를 포함한다. wrapper 비용은 동일하지 않다.
- 혼합 split/merge 대본은 순차 실행이다. Ours는 block marker, Yjs wrapper는 뒤쪽 텍스트 삭제·재삽입, Yorkie는 native Tree split/merge를 쓴다. 같은 순차 모델은 동시 Enter의 토큰 정체성이나 의도 규칙 동등성을 증명하지 않는다. 기존 Ours 동시 Enter 규칙은 변경하지 않았다.
- Yorkie 실제 wire bytes는 측정하지 않아 null이다. snapshot은 실제 저장 bytes다.
- heap delta는 GC와 allocator, clone, cache 영향을 받는다. 제품 RAM 상한이나 Yjs 대비 2배 목표의 승인 근거로 사용하지 않는다.
- CRDT GC 조건도 다르다. Ours는 명시적 Doc.gc 호출이 없고, Yjs는 기본 GC를 쓰며, Yorkie는 서비스 frontier가 없어 GC를 끈다. 저장 크기와 heap은 같은 GC frontier의 효율 비교가 아니다.
- 개별 편집 지연의 제품 목표, 메모리 목표, 엔진별 구조 정책 차이 및 30분 작업 결과를 확인해야 G0를 결정할 수 있다. 현재 G0는 미승인이다.

## 시험

- 원본 소스와 bulk-text 수정 후 소스에서 각각 하네스 시험 7/7 통과.
- freeze CLI의 소스 보존·manifest·복사된 import 검증 통과.
- 전체 프로젝트 시험과 원격 이벤트 전후 성능은 통합 담당의 별도 결과를 따른다.

재현 방법: ../../stage0/README.md
