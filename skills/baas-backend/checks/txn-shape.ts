/**
 * 트랜잭션 연산 모양 회귀 검사 — **프로젝트로 복사되지 않는다**(`boilerplate/` 밖이다).
 *
 * 서버의 트랜잭션 경로는 `update`·`delete` 에서 최상위 `id` 만 읽고 `target` 을 해석하지 않으며,
 * `update` 의 `if` 도 적용하지 않는다(2026-10-01 aiapp-service `transaction` 확인). 타입이 이
 * 둘을 받아 주면 생성 코드가 타입 검사를 통과한 채 실행에서 400 으로 깨진다 — 실제로 예약 저장이
 * `update 는 id 가 필요합니다` 로 실패했다. 그래서 받으면 안 되는 모양을 여기서 고정한다.
 */
import type { TxnOperation } from "../boilerplate/src/platform/sdk.ts"

export const accepted: TxnOperation[] = [
  { op: 'create', collection: 'reservations', id: 'r1', data: { slot_id: 's1' }, label: 'reservation' },
  { op: 'update', collection: 'reservations', id: 'r1', data: { memo: 'x' }, label: 'reservation' },
  { op: 'delete', collection: 'holds', id: 'h1', label: 'hold' },
  { op: 'increment', collection: 'slots', target: { filter: { slot_id: 's1' } }, field: 'booked', by: 1,
    guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot' },
  { op: 'increment', collection: 'slots', target: { id: 's1' }, field: 'booked', by: -1, label: 'slot' },
]

// @ts-expect-error — 트랜잭션 안 update 는 target 으로 대상을 정할 수 없다(서버가 id 만 읽는다)
export const updateByTarget: TxnOperation = { op: 'update', collection: 'reservations', target: { id: 'r1' }, data: {} }

// @ts-expect-error — 트랜잭션 안 update 에는 전제조건 if 가 없다(서버가 적용하지 않는다)
export const updateWithIf: TxnOperation = { op: 'update', collection: 'reservations', id: 'r1', data: {}, if: { status: 'confirmed' } }

// @ts-expect-error — 트랜잭션 안 delete 도 id 만 된다
export const deleteByFilter: TxnOperation = { op: 'delete', collection: 'holds', target: { filter: { slot_id: 's1' } } }

// @ts-expect-error — update 는 id 가 필수다
export const updateWithoutId: TxnOperation = { op: 'update', collection: 'reservations', data: {} }
