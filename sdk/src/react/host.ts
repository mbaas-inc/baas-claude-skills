/**
 * host React 해석 — SDK 는 React 를 번들하지 않고 앱이 노출한 인스턴스를 쓴다.
 * 앱 스캐폴드가 render 이전에 window.__BAAS_HOST__ = { React, ReactDOM } 를 설정한다.
 * 이렇게 해야 훅이 앱과 "같은" React 인스턴스에서 동작한다(Invalid hook call 방지).
 */
import type * as ReactNS from "react";

export function getReact(): typeof ReactNS {
  const host = typeof window !== "undefined" ? (window as any).__BAAS_HOST__ : null;
  if (!host || !host.React) {
    throw new Error(
      "[BaaS SDK] window.__BAAS_HOST__.React 를 찾을 수 없습니다. " +
        "앱 진입점에서 render 이전에 window.__BAAS_HOST__ = { React, ReactDOM } 를 설정하세요(스캐폴드 배선)."
    );
  }
  return host.React as typeof ReactNS;
}
