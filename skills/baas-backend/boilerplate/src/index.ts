/**
 * 진입점 — 라우트 모듈을 import 해서 등록만 한다.
 *
 * 라우트는 import 부수효과로 `route` 에 붙으므로 여기서는 나열만 하면 된다.
 * 어댑터 선택(Lambda vs 로컬)은 실행 방식이 정하지 이 파일이 정하지 않는다.
 */

import './routes/example'
import './routes/groupbuy'
import './routes/purchase'

export { lambdaHandler } from './platform/adapters'

// 로컬 실행(`npm run dev`)일 때만 HTTP 서버를 띄운다. Lambda 에서는 핸들러만 import 된다.
if (process.env.LOCAL_SERVER === '1') {
  const { startLocalServer } = await import('./platform/adapters')
  startLocalServer()
}
