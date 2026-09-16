/**
 * 예제 — 이 백엔드가 필요한 이유를 보여주는 두 가지 패턴.
 *
 * 에이전트는 이 파일을 지우고 도메인 로직으로 대체한다. 남겨둔 이유는 **경합에 안전한
 * 형태**가 직관과 다르기 때문이다.
 *
 * 임포트 경로만 실제 프로젝트와 다르다 — 프로젝트에서는 `./serverFn` 이다(이 파일은
 * `boilerplate/` 밖이라 CI 가 타입체크할 수 있도록 실경로를 쓴다).
 */

import { serverFn, ServerFnError, errorStatus, errorDetail } from '../boilerplate/src/serverFn'

/** 앱 트리는 `Sdk` 타입을 임포트할 수 없다 — 쓰는 만큼만 좁혀 쓴다. */
type BookingSdk = {
  dyncol: {
    transaction: (ops: unknown[]) => Promise<{ results: { label?: string; id?: string; value?: number }[] }>
  }
}

export type BookInput = { slotId: string }
export type BookResult = { reservationId?: string; slotId: string; number?: number }

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
 * **해법 — 두 제약을 한 트랜잭션에서 서로 다른 수단으로 막는다**:
 *   1) 카운터를 `guard` 와 함께 증가시킨다 → **총량**을 막는다.
 *      `booked <= capacity` 를 서버가 판정하고, 어기면 트랜잭션 전체가 되돌아간다.
 *   2) `slot_account_key` 를 unique 로 선언해 예약 레코드를 만든다 → **1인 1회**를 막는다.
 *
 * 둘이 한 트랜잭션이라 **중간 상태가 밖에서 보이지 않는다.** 예전 방식(증가 → 반환값 판정 →
 * 손으로 보상)은 결과는 맞지만 되돌리는 사이가 노출됐다 — 실측(2026-09-15): 실패한 4품목
 * 주문이 중간 상태를 **2.8초 이상** 노출했고 **부분 복구 상태**까지 관측됐다.
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
export const book = serverFn<BookInput, BookResult>(async (input, ctx) => {
  if (!input.slotId) throw new ServerFnError('slotId 가 필요합니다', 400)
  // 로그인 판정은 `access: 'member'` 가 핸들러 앞에서 이미 끝냈다 — 여기서 다시 쓰지 않는다.
  const sdk = ctx.sdk as BookingSdk

  try {
    const { results } = await sdk.dyncol.transaction([
      // 총량 — 경계를 연산과 함께 보낸다. 넘으면 아래 create 까지 함께 되돌아간다.
      {
        op: 'increment', collection: 'slots', target: { id: input.slotId },
        field: 'booked', by: 1,
        guard: { booked: { lte: { field: 'capacity' } } }, label: 'slot',
      },
      // 1인 1회 — unique 제약이 경합을 원자적으로 정리한다
      {
        op: 'create', collection: 'reservations',
        data: { slot_id: input.slotId, slot_account_key: `${input.slotId}:${ctx.accountId}` },
        label: 'reservation',
      },
    ])
    const slot = results.find((r) => r.label === 'slot')
    const reservation = results.find((r) => r.label === 'reservation')
    // increment 결과값이 내 순번이다 — 별도 조회가 필요 없다
    return { reservationId: reservation?.id, slotId: input.slotId, number: slot?.value }
  } catch (e) {
    if (errorStatus(e) !== 409) throw e
    // guard 위반은 `failed` 를 싣고 온다. unique 위반은 싣지 않는다 — 그게 두 거절을 가른다.
    const failed = errorDetail(e)?.failed as { label?: string } | undefined
    if (failed?.label === 'slot') throw new ServerFnError('정원이 모두 찼습니다', 409)
    throw new ServerFnError('이미 예약한 수업입니다', 409)
  }
}, { access: 'member' })
