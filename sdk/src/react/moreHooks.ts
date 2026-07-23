/**
 * 나머지 기능 훅 — recipient/notice/faq/comments/survey/reservation/store.
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

export function useRecipient() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const register = React.useCallback(
    (input: core.RecipientInput) => run(() => core.registerRecipient(input)),
    []
  );
  return { register, loading, error };
}

export function useNotice() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [posts, setPosts] = React.useState<core.PostListResult | null>(null);
  const [post, setPost] = React.useState<core.BoardPost | null>(null);
  const fetchPosts = React.useCallback(
    (o: core.PostListOptions = {}) => run(async () => { const d = await core.listNoticePosts(o); setPosts(d); return d; }),
    []
  );
  const fetchPost = React.useCallback(
    (id: string) => run(async () => { const d = await core.getNoticePost(id); setPost(d); return d; }),
    []
  );
  return { posts, post, loading, error, fetchPosts, fetchPost };
}

export function useFaq() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [posts, setPosts] = React.useState<core.PostListResult | null>(null);
  const [post, setPost] = React.useState<core.BoardPost | null>(null);
  const fetchPosts = React.useCallback(
    (o: core.PostListOptions = {}) => run(async () => { const d = await core.listFaqPosts(o); setPosts(d); return d; }),
    []
  );
  const fetchPost = React.useCallback(
    (id: string) => run(async () => { const d = await core.getFaqPost(id); setPost(d); return d; }),
    []
  );
  return { posts, post, loading, error, fetchPosts, fetchPost };
}

export function useComments() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [comments, setComments] = React.useState<core.Comment[] | null>(null);
  const fetchComments = React.useCallback(
    (postId: string, sort = "latest") => run(async () => { const d = await core.listComments(postId, sort); setComments(d); return d; }),
    []
  );
  const addComment = React.useCallback(
    (postId: string, content: string) => run(() => core.createComment(postId, { content })),
    []
  );
  const editComment = React.useCallback(
    (postId: string, commentId: string, content: string) => run(() => core.updateComment(postId, commentId, { content })),
    []
  );
  const removeComment = React.useCallback(
    (postId: string, commentId: string) => run(() => core.deleteComment(postId, commentId)),
    []
  );
  return { comments, loading, error, fetchComments, addComment, editComment, removeComment };
}

export function useSurvey() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [surveys, setSurveys] = React.useState<core.Survey[] | null>(null);
  const [survey, setSurvey] = React.useState<core.Survey | null>(null);
  const fetchSurveys = React.useCallback(
    (params: Record<string, string> = {}) => run(async () => { const d = await core.listSurveys(params); setSurveys((d as any).items ?? []); return d; }),
    []
  );
  const fetchSurvey = React.useCallback(
    (id: string) => run(async () => { const d = await core.getSurvey(id); setSurvey(d); return d; }),
    []
  );
  const submitResponse = React.useCallback(
    (id: string, answers: unknown) => run(() => core.submitSurveyResponse(id, answers)),
    []
  );
  return { surveys, survey, loading, error, fetchSurveys, fetchSurvey, submitResponse };
}

export function useReservation() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [targets, setTargets] = React.useState<core.ReservationTarget[] | null>(null);
  const fetchTargets = React.useCallback(
    () => run(async () => { const d = await core.listTargets(); setTargets(d); return d; }),
    []
  );
  const fetchTarget = React.useCallback((id: string) => run(() => core.getTarget(id)), []);
  const fetchSlots = React.useCallback((id: string, p: Record<string, string>) => run(() => core.getAvailableSlots(id, p)), []);
  const fetchSlotRange = React.useCallback((id: string, p: Record<string, string>) => run(() => core.getSlotRange(id, p)), []);
  const book = React.useCallback((id: string, data: any) => run(() => core.createBooking(id, data)), []);
  const prepare = React.useCallback((id: string, data: any) => run(() => core.prepareBooking(id, data)), []);
  const confirm = React.useCallback((id: string, payload: any) => run(() => core.confirmBooking(id, payload)), []);
  const myBookings = React.useCallback((p: Record<string, string> = {}) => run(() => core.listMyBookings(p)), []);
  const cancel = React.useCallback((rid: string) => run(() => core.cancelBooking(rid)), []);
  // 예약 결제위젯(인라인). 앱이 셀렉터 제공 → handle.requestPayment 로 결제(앱 화면 유지).
  const beginWidgetCheckout = React.useCallback(
    (id: string, params: core.ReservationWidgetCheckoutParams) =>
      core.beginReservationWidgetCheckout(id, params),
    [],
  );
  return {
    targets, loading, error, fetchTargets, fetchTarget, fetchSlots, fetchSlotRange,
    book, prepare, confirm, beginWidgetCheckout, myBookings, cancel,
    getCheckoutContext: core.getReservationCheckoutContext,
    clearCheckoutContext: core.clearReservationCheckoutContext,
  };
}

export function useStore() {
  const React = getReact();
  const { loading, error, run } = useAsync();
  const [config, setConfig] = React.useState<core.StoreConfig | null>(null);
  const [products, setProducts] = React.useState<core.Product[] | null>(null);
  const fetchConfig = React.useCallback(() => run(async () => { const d = await core.getStoreConfig(); setConfig(d); return d; }), []);
  const fetchProducts = React.useCallback((p: Record<string, string> = {}) => run(async () => { const d = await core.listProducts(p); setProducts((d as any).items ?? []); return d; }), []);
  const fetchProduct = React.useCallback((id: string) => run(() => core.getProduct(id)), []);
  // 구매약관(/terms) 조회 — 결제 전 표시 + 동의를 받는 데 사용(전자상거래 청약/환불 고지).
  const fetchTerms = React.useCallback(() => run(() => core.getStoreTerms()), []);
  const prepare = React.useCallback((productId: string, qty: number) => run(() => core.prepareOrder(productId, qty)), []);
  const confirm = React.useCallback((data: any) => run(() => core.confirmOrder(data)), []);
  const myOrders = React.useCallback((p: Record<string, string> = {}) => run(() => core.listMyOrders(p)), []);
  const confirmPurchase = React.useCallback((orderId: string) => run(() => core.confirmPurchase(orderId)), []);
  const cancel = React.useCallback((orderId: string, reason: string) => run(() => core.cancelOrder(orderId, reason)), []);
  // 결제위젯(인라인). 앱이 셀렉터 제공 → handle.requestPayment 로 결제(앱 화면 유지).
  const beginWidgetCheckout = React.useCallback(
    (params: core.StoreWidgetCheckoutParams) => core.beginStoreWidgetCheckout(params),
    [],
  );
  return { config, products, loading, error, fetchConfig, fetchProducts, fetchProduct, fetchTerms, prepare, confirm, beginWidgetCheckout, myOrders, confirmPurchase, cancel };
}
