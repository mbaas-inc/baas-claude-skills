/**
 * esbuild 단일 번들 — Lambda 업로드 아티팩트를 만든다.
 *
 * 번들로 묶는 이유는 콜드스타트다. node_modules 를 그대로 올리면 파일 수만큼 로딩이
 * 늘어난다. 단일 파일이면 수백 ms 급 기동을 유지할 수 있고, 이 서비스는 프로젝트
 * 대부분이 유휴라 거의 매 요청이 콜드스타트라서 이 차이가 체감 속도 그 자체다.
 */

import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 경로를 이 파일 위치로 고정한다. `npm run build`(backend/ 안)와 extract.mjs 의 자동
// 호출(프로젝트 루트)이 같은 결과를 내야 하는데, 상대 경로로 두면 실행 위치에 따라
// entry 를 못 찾는다.
const HERE = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.join(HERE, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.join(HERE, 'dist/index.js'),
  minify: true,
  sourcemap: 'linked',
  // aws-sdk 는 Lambda 런타임에 이미 있다 — 번들에 넣으면 크기만 커진다.
  external: ['@aws-sdk/*'],
  banner: {
    // ESM 번들에서 CJS 전용 전역(require 등)을 쓰는 의존성이 있으면 여기서 shim 한다.
    js: "import{createRequire}from'node:module';const require=createRequire(import.meta.url);",
  },
})

console.log('built → dist/index.js')
