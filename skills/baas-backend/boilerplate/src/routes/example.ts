/**
 * 예제 — 이 백엔드가 필요한 이유를 보여주는 두 가지 패턴.
 *
 * 에이전트는 이 파일을 지우고 도메인 로직으로 대체한다. 남겨둔 이유는 **경합에 안전한
 * 순서**가 직관과 다르기 때문이다. 아래 주석의 순서를 지키지 않으면 동시 요청에서
 * 정원이 초과된다.
 */

import { route, schedule } from '../platform/app'
import { SdkError } from '../platform/sdk'

interface Slot {
  capacity: number
  booked: number
  starts_at: string
}

/**
 * 정원 초과 차단 — 이 백엔드가 존재하는 대표 이유.
 *
 * **왜 프론트에서 못 하나**: 브라우저의 "조회해서 정원 확인 → 예약 생성"은 두 요청 사이가
 * 비어 있어 동시 요청 둘이 같은 마지막 자리를 통과한다. 게다가 클라이언트 검사는 그냥
 * 건너뛸 수 있다.
 *
 * **왜 dyncol 만으로 못 하나**: 회원이 `slots.booked` 를 직접 올리려면 slots 컬렉션에
 * 회원 쓰기 권한이 필요한데, 그러면 수업명·시간·정원까지 고칠 수 있게 된다. dyncol 의
 * 권한 어휘는 컬렉션 단위라 "이 필드만"이 표현되지 않는다.
 *
 * **여기서의 해법 — 두 제약을 서로 다른 수단으로 막는다**:
 *   1) `slot_member_key` 를 unique 로 선언해 예약 레코드를 **먼저 만든다**
 *      → **1인 1회**를 막는다 (dyncol advisory lock, 중복은 409).
 *   2) 카운터를 **원자 증가시키고 돌아온 새 값을 자기 순번으로 읽는다**
 *      → **총량**을 막는다. 순번이 정원을 넘으면 자기가 초과분이다.
 *   3) 초과면 카운터와 선점을 **되돌린다**(보상 트랜잭션).
 *
 * ⚠️ **"조회해서 정원 확인 → 증가" 순서는 틀렸다.** unique 선점을 먼저 해도 마찬가지다 —
 * unique 는 *같은 회원*의 중복만 막으므로, 서로 다른 회원들은 여전히 같은 `booked` 값을
 * 읽고 전원 통과한다. 실측(정원 100 · 서로 다른 회원 120명 동시):
 *
 *   조회→확인→증가            : booked = 120  ❌
 *   선점→조회·확인→증가       : booked = 120  ❌   ← unique 로도 안 막힌다
 *   선점→원자증가→보상        : booked = 100  ✅
 *
 * 판정에 **조회가 개입하면 경합할 틈이 생긴다.** 원자 연산의 반환값만 보고 판단하면
 * 각 요청이 남의 상태를 볼 필요 없이 혼자 결론을 낼 수 있다.
 */
route.post('/reservations', async (c) => {
  const { slotId } = (await c.req.json()) as { slotId?: string }
  if (!slotId) return c.json({ error: 'slotId 가 필요합니다' }, 400)
  if (!c.var.ctx.memberId) return c.json({ error: '로그인이 필요합니다' }, 401)

  // 1) 1인 1회 — unique 제약이 경합을 원자적으로 정리한다
  let reservationId: string
  try {
    const created = await c.var.sdk.dyncol.create('reservations', {
      slot_id: slotId,
      slot_member_key: `${slotId}:${c.var.ctx.memberId}`,
    })
    reservationId = created.id
  } catch (e) {
    if (e instanceof SdkError && e.status === 409) {
      return c.json({ error: '이미 예약한 수업입니다' }, 409)
    }
    throw e
  }

  // 2) 총량 — 원자 증가의 반환값이 내 순번이다. 조회하지 않는다.
  const after = await c.var.sdk.dyncol.increment<Slot>('slots', slotId, 'booked', 1)
  const myNumber = after.data.booked

  if (myNumber > after.data.capacity) {
    // 3) 보상 — 카운터를 되돌리고 선점도 해제한다
    await c.var.sdk.dyncol.increment('slots', slotId, 'booked', -1)
    await c.var.sdk.dyncol.remove('reservations', reservationId)
    return c.json({ error: '정원이 모두 찼습니다' }, 409)
  }

  return c.json({ id: reservationId, slotId, number: myNumber }, 201)
})

/**
 * 예약 전날 알림 — 스케줄이 필요한 대표 이유.
 *
 * 브라우저에는 "아무도 접속하지 않았을 때 도는 코드"가 없다. 크론이 이 핸들러를 깨우고,
 * 컨텍스트에 회원이 없으므로(`memberId === null`) 전체 조회 권한이 필요하다.
 *
 * 발송은 크레딧을 쓰므로 한 번에 처리할 건수를 스스로 제한한다 — 스케줄은 실패해도
 * 아무도 즉시 알아채지 못하는 경로라 폭주가 특히 위험하다.
 */
schedule('reservation-reminder', async (sdk) => {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
  const { items } = await sdk.dyncol.list<{ slot_id: string; phone?: string }>(
    'reservations', { filter: { reminder_date: tomorrow }, limit: 100 },
  )

  for (const r of items) {
    if (!r.data.phone) continue
    await sdk.baas.sendSms(r.data.phone, '내일 예약하신 수업이 있습니다.')
  }
  console.log(`[reminder] ${items.length}건 처리 (${tomorrow})`)
})
