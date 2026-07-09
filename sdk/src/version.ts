// 빌드 시 build.mjs 가 define 으로 치환한다. 소스 기본값은 개발용.
export const SDK_VERSION: string =
  typeof __SDK_VERSION__ !== "undefined" ? __SDK_VERSION__ : "0.0.0-dev";

declare const __SDK_VERSION__: string;
