# 지급대행(토스) 셀러 결제 도메인 설계 (Payment domain)

> 스코프: **토스페이먼츠 지급대행 기반 "셀러 결제"** 도메인 (PortOne 플랫폼 결제와 별개 — §0 참조).

> 상태: **설계 초안(합의 대상)** — 구현 전. 배경은 CLI+SDK+SDK스킬+에이전트로 기획만 가지고 앱을 생성하는
> 빌더에서 결제를 어떻게 다룰지에 대한 것. store/reservation을 별도 도메인으로 보던 구조를 **"결제"라는
> 하나의 도메인**으로 재편하는 방향을 정의한다.

## 1. 배경 · 문제
현재 결제는 **store와 reservation이 각자 소유**한다(각자 prepare/confirm/금액/이행). 그 결과:
- **계약 드리프트**: 같은 개념(결제 주문 식별자 = 토스 orderId)인데 필드명이 갈렸다 — store `order_no`,
  reservation `order_id`. 실제로 이 불일치로 confirm VALIDATION_ERROR가 났다.
- **돈 흐름 중복**: 약관 고지(usePayment)·위젯(renderPaymentWidget)은 이미 공통인데 prepare/confirm만 도메인마다 중복.
- **커스텀 결제 불가**: 커스텀 컬렉션(주문/신청 등)에 결제를 안전하게 붙일 표면이 없다.

**핵심 관찰**: 도메인은 "스토어"나 "예약"이 아니라 **"결제"** 이고, store·reservation·custom은 **"무엇을
사느냐(이행 대상, fulfillment target)"** 일 뿐이다.

## 0. 도메인 스코프 (중요 — 무엇을 설계하는가)
이 문서의 "결제 도메인" = **토스페이먼츠 지급대행 기반 "셀러 결제" 도메인**이다.
- **목적**: 플랫폼(주식회사 엠바스 = 통신판매중개자)이 구매자 결제를 받고, **토스 지급대행으로 셀러에게
  정산·지급**하는 구조를 재사용 가능한 도메인으로 정식화 → **셀러들에게 결제 기능 제공**.
- store·reservation·(향후)custom = 이 도메인을 쓰는 **이행 대상**(셀러가 파는 것).
- **PortOne 결제 도메인은 별개**다(`routers/webhook/portone.py` — 플랫폼 자체 결제, 예: 플랜/크레딧).
  이 설계는 PortOne과 합치지 않는다 — **토스 지급대행 도메인 내부**의 정식화·재사용이다.
- 지급대행 특성: **셀러별 서브상점(sub-merchant)** 단위로 등록·정산. 통신판매중개 고지(엠바스=중개자,
  당사자 아님)가 이 모델에서 나온다.

## 1.5 결정 사항 (합의됨)
- **식별자 = `order_no` 단일**로 확정(store·reservation·향후 도메인 공통. reservation의 order_id도 통일 대상).
- **범위 = 결제 도메인 분리 + store·reservation 공용화**. 다른 결제 필요 도메인이 생기면 **어댑터로 재사용**.
- **커스텀 결제는 지금 구현하지 않음** — 단, 이행 어댑터 인터페이스를 열어둬 **나중에 target_type=custom 을
  붙일 수 있게** 설계만 확보(이번 스코프 밖).
- **정산 권위 = 토스 웹훅(권위) + 클라 confirm(즉시 UX backstop)**. 토스가 웹훅을 제공하므로
  (`PAYMENT_STATUS_CHANGED` 등, 재조회 검증 가능) 결제 도메인을 새로 분리하는 이번에 **웹훅 수신부를 도메인
  안에 포함**한다 — 브라우저 이탈(결제됐는데 주문 미생성) 문제를 근본 해결. 웹훅과 confirm 중 먼저 온 것이
  멱등하게 PAID 확정.

## 2. 목표
- **하나의 결제 계약**: prepare → 위젯 → confirm → 이행. 식별자·약관·위젯·정산을 결제 도메인이 단일 소유.
- **재사용**: store/reservation/custom이 같은 결제 표면을 쓴다. 도메인 차이(금액 산출·이행)만 어댑터로 분리.
- **안전 불변식 보존**: 금액 권위·시크릿키 정산·위·변조 방지를 결제 도메인이 일괄 보장.

## 3. 개념 모델
```
                      ┌─────────────────────── 결제 도메인 (money) ───────────────────────┐
기획→앱 (SDK)         │  prepare(대상 ref, 금액권위 원천) → 위젯(공통) → confirm(시크릿키 정산) │
  usePayment ────────▶│    · 식별자: order_no (단일)     · 약관: fetchTerms   · 위젯: 공통      │
                      │    · terms_agreed   · 멱등(단일사용)   · 금액 서버확정·재검증           │
                      └───────────────┬───────────────────────────────────────────────────────┘
                                      │ 결제 확정 시 (server-side)
                     ┌────────────────┴─────────────────┐  이행 어댑터 (fulfillment)
                     ▼                ▼                  ▼
               store: 주문 생성   reservation: 예약 생성   custom: 레코드 갱신(paid)
               금액원천=상품가     금액원천=예약정책        금액원천=관리자가격/변동금액
```
- **결제 도메인**이 소유: 식별자(order_no)·금액 권위·confirm(시크릿키)·약관·위젯·멱등.
- **이행 어댑터**가 소유: "무엇을 파느냐"의 도메인 로직(금액 산출 원천, 결제 후 무엇을 만들/바꿀지).

## 4. 통합 계약 (contract)
### prepare
```
POST /payment/prepare
  { target_type: "store"|"reservation"|"custom",
    target_ref: <상품/슬롯/커스텀 대상 식별자>,
    quantity?, form_data?,        // 대상별 부가입력
    terms_agreed: true }
→ { order_no, amount, order_name, client_key }   // 금액은 서버가 target 원천에서 확정
```
### confirm (또는 웹훅)
```
POST /payment/confirm
  { order_no, payment_key, amount, terms_agreed: true }
→ { status: PAID, order_no, ... }   // 시크릿키로 토스 재검증 + 이행 트리거
```
- **식별자는 `order_no` 하나로 통일**(store·reservation·custom 공통). 값은 토스 orderId.
- **금액은 클라이언트가 못 정한다** — prepare가 target 원천(상품가/예약정책/관리자가격)에서 서버 확정, confirm이
  시크릿키로 실결제액 == 확정액 재검증.

## 5. 이행 어댑터 (fulfillment adapters)
결제 확정(시크릿키 검증 성공) 시점에 **서버가** target_type별 이행을 트리거:
| target_type | 금액 권위 원천 | 이행(결제 확정 후) |
|---|---|---|
| store | 상품(product) 가격 | 주문(ProjectStoreOrder) 생성 (PAID) |
| reservation | 예약 대상 결제정책(onsite/online) | 예약(booking) 생성 (PAID) |
| custom | (고정가) 관리자 소유 가격 / (변동가) prepare 기록액 | 커스텀 레코드 생성·갱신(paid) |

어댑터 인터페이스(개념): `resolveAmount(target_ref, input) -> amount` + `fulfill(order_no, payment) -> domain_result`.

## 6. 안전 불변식 (반드시 유지)
앞선 논의(백엔드 프리미티브·웹훅)에서 도출한 것들:
1. **금액 서버 확정**: prepare가 target 원천에서 금액 산출(클라이언트 amount 신뢰 금지).
2. **시크릿키 정산 검증**: confirm(및/또는 웹훅)이 시크릿키로 토스 실결제액을 조회해 확정액과 일치 검증.
3. **멱등 + 단일사용**: 같은 order_no 재confirm/웹훅 재전송에도 이행 1회만(이미 PAID면 무시).
4. **금액·구매자 바인딩**: order_no에 묶인 금액(과 가능하면 구매자)이 이행 대상과 일치.
5. **paid 상태 = 서버 소유**: 커스텀 컬렉션 필드에 결제상태를 두고 클라이언트가 쓰는 것 금지 —
   "결제됨"은 order_no로 결제원장을 조회(read-through)하거나 서버 이행이 갱신.
6. **웹훅 신뢰(권장)**: 토스 웹훅으로 서버가 정산 확정(클라 confirm은 즉시 UX용 backstop). 웹훅 수신은
   **서명 검증** 필수(외부 노출 엔드포인트).

## 7. 커스텀 결제
- 커스텀 컬렉션은 도메인 데이터(주문항목·배송지·상태이력)를 소유하고, **결제 결과 `order_no`(또는 payment_id)를
  필수 reference로 연결**한다.
- "결제됨" 판정은 **order_no로 결제원장 조회(read-through)** 또는 **서버 이행이 커스텀 레코드를 갱신**(paid 서버 전용).
- **고정가**: 금액 원천을 관리자만 쓰는 가격 소스에 둔다(클라 편집 가능한 컬렉션 필드 금지).
  **변동가(기부·충전·보증금)**: 사용자가 금액을 고르는 게 정상 → prepare 기록액 + confirm 재검증만으로 안전.

## 8. SDK 표면 변화
- **`usePayment()`가 결제 표면의 중심**이 된다: `fetchTerms`(현행) + `prepare` + `confirm` + `beginWidgetCheckout`.
- `useStore()`/`useReservation()`은 **도메인 데이터**(상품·슬롯·주문·예약 조회)를 소유하되, **결제 실행은
  `usePayment`로 위임**(현재 각 훅의 beginWidgetCheckout/confirm은 usePayment로 수렴).
- 위젯 렌더(renderPaymentWidget)·약관·식별자(order_no)는 이미/앞으로 공통.

## 9. 마이그레이션 경로 (단계적)
1. **계약 통일(단기)**: reservation confirm/prepare 필드도 `order_no`로 맞춰 store와 통일(작은 백엔드 PR).
   → 드리프트 제거. SDK 결제 표면을 usePayment로 수렴 시작.
2. **결제 도메인 서비스(중기)**: 백엔드에 단일 `/payment/prepare|confirm`(+웹훅) + 이행 어댑터(store/reservation
   기존 로직을 어댑터로 편입). SDK usePayment.prepare/confirm 노출.
3. **커스텀 결제 개방(중기)**: custom target_type + 어댑터(read-through/서버 이행). 스킬에 "커스텀 결제 붙이는 법" 규약.
4. **정리**: store/reservation의 중복 prepare/confirm 제거(어댑터로 대체), 스킬을 결제 단일 도메인 관점으로 재서술.

## 10. 합의 결과 / 남은 것
**합의됨**
- ✅ **식별자 = `order_no` 단일**.
- ✅ **정산 권위 = 토스 웹훅(권위) + 클라 confirm(UX backstop)** — 웹훅 수신부를 결제 도메인에 포함.
- ✅ **커스텀 결제 미포함**(어댑터 인터페이스로 확장 여지만 확보).

**남은 것(구현 착수 전 확정)**
- **이행 어댑터 위치**: 백엔드 결제 서비스 내부 등록 vs 도메인 모듈이 결제 도메인에 등록(플러그인).
- **웹훅 운용** (토스 공식 스펙 기준, docs.tosspayments.com/guides/v2/webhook):
  - **이벤트**: 결제정산은 **`PAYMENT_STATUS_CHANGED`**(모든 결제수단 상태 변경). 취소는 `CANCEL_STATUS_CHANGED`,
    가상계좌 입금은 `DEPOSIT_CALLBACK`. (지급대행 `payout.changed`/`seller.changed`는 기존 처리)
  - **등록**: 토스 **개발자센터 웹훅 메뉴 → 웹훅 등록하기**(이름·URL·이벤트 선택), **상점(MID)별** 설정.
    지급대행은 셀러 서브상점 단위 → 등록·정산이 셀러 단위. (ops/사람 — 코드로 불가)
  - **응답 규약**: **10초 이내 200** 반환 필수. 미수신 시 **최대 7회 재전송**(1·4·16·64·256·1024·4096분, ~3일19시간).
  - **⇒ 멱등 필수**(재전송 대비): `order_no` 기준 이미 PAID면 무시. body만 신뢰 말고 **paymentKey 재조회
    (GET /v1/payments/{paymentKey}, 시크릿키)로 상태·금액 확정**(가이드에 서명 규약 없음).
  - 기존 `webhook/toss.py`에 `PAYMENT_STATUS_CHANGED` 분기 추가 → 재조회 검증 → 멱등 create_paid_session + 이행.
- (향후) 커스텀 금액 권위(고정가/변동가) 모델.

---
### 부록: 현재(분리) vs 목표(단일)
| | 현재 | 목표 |
|---|---|---|
| 소유 | store·reservation 각자 결제 | 결제 도메인 단일 |
| 식별자 | order_no / order_id (드리프트) | order_no 단일 |
| 약관·위젯 | 공통(usePayment/renderPaymentWidget) | 공통(유지) |
| 커스텀 결제 | 불가 | target_type=custom + 어댑터 |
| SDK 표면 | useStore/useReservation에 결제 분산 | usePayment 중심 |
