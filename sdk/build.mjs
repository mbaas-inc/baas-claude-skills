/**
 * SDK 빌드 — core/react 각각 IIFE(전역, <script>용) + ESM(import용) 산출.
 * react 는 React 를 번들하지 않는다(host 인스턴스 사용, host.ts 가 window 에서 해석).
 * 버전은 sdk-vX.Y.Z 태그 또는 SDK_VERSION 환경변수 → __SDK_VERSION__ 로 주입.
 */
import { build } from "esbuild";
import { rmSync, mkdirSync } from "node:fs";

const version = process.env.SDK_VERSION || "0.0.0-dev";
const outdir = "dist";

rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: true,
  target: ["es2020"],
  define: { __SDK_VERSION__: JSON.stringify(version) },
  logLevel: "info",
};

await Promise.all([
  // core — 전역 BaasCore
  build({ ...common, entryPoints: ["src/core/index.ts"], format: "iife", globalName: "BaasCore", outfile: `${outdir}/baas-core.js` }),
  build({ ...common, entryPoints: ["src/core/index.ts"], format: "esm", outfile: `${outdir}/baas-core.esm.js` }),
  // react — 전역 BaasSDK (React 는 external: window.__BAAS_HOST__ 사용, 번들 제외)
  build({ ...common, entryPoints: ["src/react/index.ts"], format: "iife", globalName: "BaasSDKModule", outfile: `${outdir}/baas-react.js`,
    footer: { js: "window.BaasSDK=BaasSDKModule.BaasSDK;" } }),
  build({ ...common, entryPoints: ["src/react/index.ts"], format: "esm", outfile: `${outdir}/baas-react.esm.js` }),
]);

console.log(`\n✅ SDK 빌드 완료 (version=${version}) → ${outdir}/`);
