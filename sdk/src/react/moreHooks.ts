/**
 * 결제 공통 훅 — usePayment. (2.0 에서 고정 기능 훅은 제거됐다 — 업무 데이터는 useCollection·serverFn)
 * 모두 host React 사용. 공통 { loading, error } + 데이터 상태 패턴.
 */
import { getReact } from "./host";
import * as core from "../core/index";

function useAsync() {
  const React = getReact();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);
  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e as Error);
      return null;
    } finally {
      setLoading(false);
    }
  }
  return { loading, error, run };
}

/** 결제 공통 훅 — fetchTerms()로 표준 구매약관을 받아 결제 전 표시+동의.
 *  커스텀 결제(#900): serverFn 이 만든 세션으로 beginWidget → 복귀 페이지에서 getRedirectResult → serverFn 이 승인. */
export function usePayment() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const fetchTerms = React.useCallback(() => run(() => core.getPurchaseTerms()), []);
  // run 으로 감싸지 않는다 — 실패를 throw 로 받아 앱이 처리한다.
  const beginWidget = React.useCallback(
    (session: core.CustomPaymentSession, params: core.PaymentWidgetParams) =>
      core.beginPaymentWidget(session, params),
    []
  );
  return { fetchTerms, beginWidget, getRedirectResult: core.getPaymentRedirectResult, loading, error };
}
