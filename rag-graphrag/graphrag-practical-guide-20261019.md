# GraphRAG 실무 가이드 - 출처 대조 개정판

작성: 주식회사 별의문 | 최초 원고: 2026-07-25 | 개정: 2026-10-19

## 문서의 기준과 검증 범위

월간 통계 기준월은 비적용입니다. 확인한 최신 정식 릴리스는 Microsoft GraphRAG v3.3.0, 공표시각 2026-10-08T18:28:43Z, 커밋 5faaaf4f5685fa2056fa8c3bf9342cb089f2942f입니다. 공표일·문서 개정일·이번 확인일은 서로 다른 날짜입니다. 공식 문서와 고정 코드의 존재를 확인했으며 설치·인덱싱·실자료 성능 실험은 실행하지 않았습니다. [G1]

## 1. 방법론의 범위

Edge 등의 원논문 v2(2025-02-19)는 그래프와 커뮤니티 요약을 이용해 전역 질문을 다룹니다. 보고된 결과는 논문의 코퍼스·질문·평가 조건에 한정됩니다. GraphRAG를 모든 다중 홉 질의의 정답이나 다른 RAG 설계보다 항상 우수한 방식으로 설명하지 않습니다. [G2]

## 2. Standard와 Fast를 구분

Standard는 LLM으로 엔티티·관계와 설명을 추출하고 커뮤니티 리포트를 생성합니다. Claim 추출은 선택 사항입니다. FastGraphRAG는 명사구·동시 출현 등 NLP 처리를 이용해 일부 추출 단계를 바꾸며 커뮤니티 리포트 생성에는 LLM을 사용합니다. 따라서 모든 GraphRAG가 문서 전량에 같은 LLM 추출 비용을 지불한다고 단정할 수 없습니다. 공식 문서는 기본 NLP 방식의 영어 적합성을 언급하므로 한국어에서의 품질은 별도 실험이 필요합니다. [G3]

## 3. 검색 모드

- Basic: 원문 텍스트 유닛의 벡터 검색을 이용하는 비교 기준선입니다. 그래프 모드를 반드시 사용해야 하는 것은 아닙니다. [G4]
- Local: 특정 엔티티와 관련된 그래프 자료·원문 청크를 결합합니다. [G4]
- DRIFT: 커뮤니티 리포트로 초기 답변·후속 질문을 만들고 Local 검색으로 구체화합니다. 계산량과 결과를 평가해야 하며 보편적 1순위 모드로 정하지 않습니다. [G5]
- Global: 선택한 계층의 커뮤니티 리포트를 토큰 예산에 맞는 묶음으로 처리하고 중간 결과를 종합합니다. 커뮤니티 하나당 호출 한 번이라는 고정 공식은 아닙니다. [G6]

네 모드의 존재와 절차를 확인한 것이며, 모드별 정확도·금액·지연 수치를 측정한 것은 아닙니다. 화면은 질의 유형에 따른 비교 후보를 안내하며 외부 모델을 호출하지 않습니다.

## 4. 갱신과 비용

v3.3.0의 고정 코드에는 기존 문서와 입력 자료의 차이를 다루는 증분 처리 코드가 있습니다. 따라서 증분 갱신을 불가로 표현하지 않습니다. 확인한 함수는 제목을 이용한 차이 계산을 포함합니다. 동일 제목 문서의 본문 수정·삭제·커뮤니티 리포트 재생성이 실제로 어떻게 반영되는지는 별도 실행 검증이 필요합니다. [G7]

추출·요약·질의·갱신의 토큰과 지연을 따로 측정한 뒤 전체 비용을 산정합니다. 7월 원고의 수십-수백 배 비용, 70-85% 저비용 라우팅 비율은 이 프로젝트의 측정 근거가 없어 개정판에서 제외했습니다. 현재 모델 가격이나 금액 견적도 제시하지 않습니다.

## 5. 도입 판단과 남은 작업

고정 버전·설정·한국어 평가셋을 마련하고 Basic 또는 기존 RAG와 질의 유형별로 비교해야 합니다. 그래프와 생성 요약의 원문 지지도, 권한과 삭제 반영, 오류·무응답을 함께 확인합니다. 평가 표본 수와 라우팅 임계치는 실험 후 정합니다.

이번 점검은 공식 원문·코드 대조이며 v3.3.0 실행 호환성이나 비용 우위를 인증하지 않습니다. 다른 그래프 제품의 최신 기능·비용까지 이번에 대조하지 않았으므로 검증된 대안 순위를 싣지 않습니다. 기존 2026-07-25 원고와 PDF는 이전판 보관본으로 유지합니다.

## 출처

- [G1] Microsoft GraphRAG v3.3.0 정식 릴리스: https://github.com/microsoft/graphrag/releases/tag/v3.3.0
- [G2] Edge et al., GraphRAG 원논문 v2: https://arxiv.org/abs/2404.16130v2
- [G3] v3.3.0 Indexing Methods 고정 문서: https://github.com/microsoft/graphrag/blob/v3.3.0/docs/index/methods.md
- [G4] v3.3.0 Query Overview 고정 문서: https://github.com/microsoft/graphrag/blob/v3.3.0/docs/query/overview.md
- [G5] Microsoft DRIFT 공식 문서, 2026-10-19 수신본: https://microsoft.github.io/graphrag/query/drift_search/
- [G6] v3.3.0 Global Search 고정 문서: https://github.com/microsoft/graphrag/blob/v3.3.0/docs/query/global_search.md
- [G7] v3.3.0 증분 처리 코드: https://github.com/microsoft/graphrag/blob/v3.3.0/packages/graphrag/graphrag/index/update/incremental_index.py
- 대조 범위·응답 해시: https://www.stargateedu.co.kr/research/source-reviews/2026-10-19-research-2.json
