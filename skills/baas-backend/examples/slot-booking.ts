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
 * **여기서의 해법 — 두 제약을 한 트랜잭션에서 서로 다른 수단으로 막는다**:
 *   1) 카운터를 `guard` 와 함께 증가시킨다 → **총량**을 막는다.
 *      `booked <= capacity` 를 서버가 판정하고, 어기면 트랜잭션 전체가 되돌아간다.
 *   2) `slot_account_key` 를 unique 로 선언해 예약 레코드를 만든다 → **1인 1회**를 막는다
 *      (dyncol advisory lock, 중복은 409).
 *
 * 둘이 한 트랜잭션이라 **중간 상태가 밖에서 보이지 않는다.** 예전 방식(증가 → 반환값 판정 →
 * 손으로 보상)은 결과는 맞지만 되돌리는 사이가 노출됐다 — 실측(2026-09-15): 실패한 4품목
 * 주문이 중간 상태를 **2.8초 이상** 노출했고 **부분 복구 상태**까지 관측됐다. 그동안 다른
 * 손님에게는 남은 자리가 마감으로 보이고, 서버가 실제로 그 거절을 돌려줄 수 있다.
 *
 * ⚠️ **"조회해서 정원 확인 → 증가" 순서는 여전히 틀렸다.** unique 선점을 먼저 해도
 * 마찬가지다 — unique 는 *같은 회원*의 중복만 막으므로, 서로 다른 회원들은 같은 `booked`
 * 값을 읽고 전원 통과한다. 실측(정원 100 · 서로 다른 회원 120명 동시):
 *
 *   조회→확인→증가            : booked = 120  ❌
 *   선점→조회·확인→증가       : booked = 120  ❌   ← unique 로도 안 막힌다
 *   원자증가 + guard          : booked = 100  ✅
 *
 * 판정에 **조회가 개입하면 경합할 틈이 생긴다.** 경계를 연산과 함께 보내면 각 요청이 남의
 * 상태를 볼 필요 없이 서버 안에서 결론이 난다.
 */
route.post('/reservations', async (c) => {
  const { slotId } = (await c.req.json()) as { slotId?: string }
  if (!slotId) return c.json({ error: 'slotId 가 필요합니다' }, 400)
  if (!c.var.ctx.accountId) return c.json({ error: '로그인이 필요합니다' }, 401)

  try {
    const { results } = await c.var.sdk.dyncol.transaction([
      // 총량 — 경계를 연산과 함께 보낸다. 넘으면 아래 create 까지 함께 되돌아간다.
      {
        op: 'increment', collection: 'slots', target: { id: slotId },
        field: 'booked', by: 1,
        guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot',
      },
      // 1인 1회 — unique 제약이 경합을 원자적으로 정리한다
      {
        op: 'create', collection: 'reservations',
        data: { slot_id: slotId, slot_account_key: `${slotId}:${c.var.ctx.accountId}` },
        label: 'reservation',
      },
    ])
    const slot = results.find((r) => r.label === 'slot')
    const reservation = results.find((r) => r.label === 'reservation')
    // increment 결과값이 내 순번이다 — 별도 조회가 필요 없다
    return c.json({ id: reservation?.id, slotId, number: slot?.value }, 201)
  } catch (e) {
    if (!(e instanceof SdkError) || e.status !== 409) throw e
    // guard 위반은 `failed` 를 싣고 온다. unique 위반은 싣지 않는다 — 그게 두 거절을 가른다.
    const failed = e.detail?.failed as { label?: string } | undefined
    if (failed?.label === 'slot') return c.json({ error: '정원이 모두 찼습니다' }, 409)
    return c.json({ error: '이미 예약한 수업입니다' }, 409)
  }
})

/**
 * 예약 전날 알림 — 스케줄이 필요한 대표 이유.
 *
 * 브라우저에는 "아무도 접속하지 않았을 때 도는 코드"가 없다. 크론이 이 핸들러를 깨우고,
 * 컨텍스트에 회원이 없으므로(`accountId === null`) 전체 조회 권한이 필요하다.
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
