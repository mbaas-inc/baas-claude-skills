/**
 * 예제 — 항목 수가 정해지지 않은 트랜잭션: 픽업 주문의 정원 확보 + 메뉴별 재고 차감 + 주문 생성.
 *
 * SKILL.md 「트랜잭션」 절의 코드와 같은 형태다. 에이전트는 이 파일을 지우고 도메인 로직으로 대체한다.
 * 남겨둔 이유는 **주문에 담긴 메뉴 수만큼 재고 차감을 한 트랜잭션에 넣는 방법**이 직관과 다르기 때문이다.
 *
 * - 메뉴 수가 정해지지 않으므로 `...lines.map((l) => ({ … }))` 로 펼친다. 추출기는 콜백이 돌려주는
 *   객체 리터럴의 `op`·`collection` 을 읽어 권한을 유도한다 — 둘은 **문자열 리터럴**로 쓴다.
 * - `op` 에 `as const` 를 붙인다. 없으면 `op` 가 `string` 으로 넓어져 트랜잭션 항목 타입에 맞지 않는다.
 * - 실패는 `label` 로 가른다. index 로 가르면 메뉴 수가 바뀌는 순간 조용히 어긋난다.
 *
 * 임포트 경로만 실제 프로젝트와 다르다 — 프로젝트에서는 `./serverFn` 이다.
 */

import { serverFn, ServerFnError, errorStatus, errorDetail } from '../boilerplate/src/serverFn'

type TxnItem =
  | { op: 'create'; collection: string; data: Record<string, unknown>; label?: string }
  | {
      op: 'increment'
      collection: string
      target: { id: string } | { filter: Record<string, unknown> }
      field: string
      by: number
      guard?: Record<string, Record<string, unknown>>
      label?: string
    }

/** 앱 트리는 `Sdk` 타입을 임포트할 수 없다 — 쓰는 만큼만 좁혀 쓴다. */
type OrderSdk = {
  dyncol: {
    transaction: (ops: TxnItem[]) => Promise<{ results: { label?: string; id?: string; value?: number }[] }>
  }
}

export type OrderLine = { menuItemId: string; quantity: number }
export type PlaceOrderInput = { slotId: string; lines: OrderLine[] }
export type PlaceOrderResult =
  | { status: 'ordered'; orderId?: string }
  | { status: 'slot_full' }
  | { status: 'sold_out'; menuItemId: string }

export const placeOrder = serverFn<PlaceOrderInput, PlaceOrderResult>(async (input, ctx) => {
  if (!input.slotId) throw new ServerFnError('slotId 가 필요합니다', 400)
  const lines = input.lines.filter((l) => l.quantity > 0)
  if (lines.length === 0) throw new ServerFnError('주문할 메뉴가 없습니다', 400)
  // 정원 1 + 메뉴 + 주문 1 — 트랜잭션 한 번은 최대 25 작업이다.
  if (lines.length > 23) throw new ServerFnError('한 번에 주문할 수 있는 메뉴는 23가지까지입니다', 400)
  const sdk = ctx.sdk as OrderSdk

  try {
    const { results } = await sdk.dyncol.transaction([
      // 정원 확보 — booked 가 capacity 를 넘으면 전체가 되돌아간다
      {
        op: 'increment', collection: 'pickup_slots', target: { filter: { slot_id: input.slotId } },
        field: 'booked', by: 1,
        guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot',
      },
      // 재고 차감 — 메뉴마다 하나씩. 음수가 되면 전체가 되돌아간다
      ...lines.map((l) => ({
        op: 'increment' as const, collection: 'menu_stock',
        target: { filter: { menu_item_id: l.menuItemId } },
        field: 'remaining', by: -l.quantity,
        guard: { remaining: { gte: 0 } }, label: `stock:${l.menuItemId}`,
      })),
      {
        op: 'create', collection: 'orders',
        data: { slot_id: input.slotId, account_id: ctx.accountId, lines },
        label: 'order',
      },
    ])
    return { status: 'ordered', orderId: results.find((r) => r.label === 'order')?.id }
  } catch (e) {
    if (errorStatus(e) !== 409) throw e
    const failed = errorDetail(e)?.failed as { label?: string } | undefined
    if (failed?.label?.startsWith('stock:')) return { status: 'sold_out', menuItemId: failed.label.slice(6) }
    if (failed?.label === 'slot') return { status: 'slot_full' }
    throw e
  }
}, { access: 'member' })
