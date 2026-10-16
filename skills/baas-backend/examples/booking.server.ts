/**
 * 예제 — 관리 화면이 부르는 사장님 동작(승인·거절).
 *
 * 사장님 화면은 앱이 아니라 AI Studio 관리 화면이 `backend/admin.json` 으로 그리고, 버튼은 이 함수들을
 * `booking.server.adminApprove` 로 부른다(파일 이름 `booking.server` + export 이름). 파일 이름에 하이픈을 쓰면
 * 명세가 그 이름을 받지 않는다. 입력은 관리 화면 계약대로 `{ id, …입력값 }` 이다.
 *
 * **왜 이 모양인가**
 * - 사장님이 두 기기에서 동시에 누르거나, 응답이 늦어 한 번 더 누를 수 있다. 상태 전이는 단건
 *   `update(…, { if: { status: 'pending' } })` 로 해서 **한 번만 이긴다.**
 * - 진 쪽(409)은 다시 읽어 **이미 원하는 상태면 그대로 돌려준다** — 같은 버튼을 두 번 눌러도 오류가 아니다.
 *   다른 상태로 바뀌어 있으면(승인하려는데 이미 거절됨) 그 사실을 409 문구로 알린다. 관리 화면이 그대로 보인다.
 * - 거절은 자리를 돌려준다. **이긴 쪽만** 되돌린다 — 진 쪽까지 되돌리면 자리가 두 번 늘어난다.
 * - 업무의 실제 상태(`pending → approved | rejected`)로 만든다. 「접수 → 확인 중 → 완료」 같은 범용 단계로
 *   뭉개면 사장님이 거절할 방법이 사라진다(2026-10-16 실측).
 *
 * 임포트 경로만 실제 프로젝트와 다르다 — 프로젝트에서는 `./serverFn` 이다.
 */

import { serverFn, ServerFnError, errorStatus } from '../boilerplate/src/serverFn'

type Booking = { status: 'pending' | 'approved' | 'rejected'; slot_id: string; reject_reason?: string }
type Rec<T> = { id: string; data: T }

/** 앱 트리는 `Sdk` 타입을 임포트할 수 없다 — 쓰는 만큼만 좁혀 쓴다. */
type OwnerSdk = {
  dyncol: {
    get: <T>(collection: string, id: string) => Promise<Rec<T>>
    update: <T>(collection: string, id: string, data: Record<string, unknown>, opts?: { if?: Record<string, unknown> }) => Promise<Rec<T>>
    increment: <T>(collection: string, target: { id: string }, field: string, by: number) => Promise<Rec<T>>
  }
}

export type OwnerActionResult = { id: string; status: Booking['status'] }

const STATUS_LABEL: Record<Booking['status'], string> = { pending: '확인 대기', approved: '승인', rejected: '거절' }

/**
 * 조건부 전이. 이기면 갱신된 레코드, 지면 다시 읽어 판정한다.
 * - 이미 `to` 상태 → 그대로 돌려준다(`changed: false`)
 * - 다른 상태 → 409 를 사장님이 읽을 문구로 던진다
 */
async function transition(
  sdk: OwnerSdk, id: string, to: Booking['status'], extra: Record<string, unknown> = {},
): Promise<{ record: Rec<Booking>; changed: boolean }> {
  try {
    const record = await sdk.dyncol.update<Booking>('bookings', id, { status: to, ...extra }, { if: { status: 'pending' } })
    return { record, changed: true }
  } catch (e) {
    if (errorStatus(e) === 404) throw new ServerFnError('예약을 찾을 수 없습니다', 404)
    if (errorStatus(e) !== 409) throw e
    const now = await sdk.dyncol.get<Booking>('bookings', id)
    if (now.data.status === to) return { record: now, changed: false }
    throw new ServerFnError(`이미 「${STATUS_LABEL[now.data.status]}」 상태입니다. 새로고침해 주세요`, 409)
  }
}

export const adminApprove = serverFn<{ id: string }, OwnerActionResult>(async (input, ctx) => {
  if (!input.id) throw new ServerFnError('id 가 필요합니다', 400)
  // 소유자 판정은 `access: 'owner'` 가 핸들러 앞에서 이미 끝냈다 — 여기서 다시 쓰지 않는다.
  const { record } = await transition(ctx.sdk as OwnerSdk, input.id, 'approved')
  return { id: record.id, status: record.data.status }
}, { access: 'owner' })

export const adminReject = serverFn<{ id: string; reason: string }, OwnerActionResult>(async (input, ctx) => {
  if (!input.id) throw new ServerFnError('id 가 필요합니다', 400)
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason) throw new ServerFnError('거절 사유를 적어 주세요', 400)
  const sdk = ctx.sdk as OwnerSdk
  const { record, changed } = await transition(sdk, input.id, 'rejected', { reject_reason: reason })
  // 이긴 쪽만 자리를 돌려준다. 다시 누른 요청(changed=false)이 또 돌려주면 정원이 늘어난다.
  if (changed) await sdk.dyncol.increment('slots', { id: record.data.slot_id }, 'booked', -1)
  return { id: record.id, status: record.data.status }
}, { access: 'owner' })
