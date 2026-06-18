/**
 * BaaS Store(디지털 상품 구매) React Hooks
 *
 * 상품/설정/약관 조회 + 토스 결제창 체크아웃 + 결제 승인 + 내 주문 관리.
 * 조회(config/products/terms)는 인증 불필요, 주문·결제·확정·취소는 프로젝트 회원 로그인 필요.
 *
 * ⚠️ 결제 위험 구간은 이 훅이 전부 캡슐화합니다 — 훅 내부 로직을 수정하지 말고 그대로 사용하세요.
 *   - 금액은 항상 서버 주문 응답(amount)을 사용 (클라이언트 계산 금지)
 *   - successUrl/failUrl 라우트 규약: /checkout/success, /checkout/fail (references/store.md 참조)
 *   - 약관 동의(termsAgreed) 없이 checkout()을 호출하면 에러
 *
 * 사용법:
 * const { config } = useStoreConfig();                          // store_enabled 확인
 * const { products, categories, fetchProducts } = useStoreProducts();
 * const { terms } = useStoreTerms();
 * const { checkout, isLoading } = useCheckout();                // 결제창까지 진행
 * const { confirmResult } = useCheckoutConfirm();               // /checkout/success 전용
 * const { orders, fetchMine, confirmPurchase, cancelOrder } = useMyOrders();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID / NEXT_PUBLIC_BAAS_PROJECT_ID / VITE_BAAS_PROJECT_ID
 */

import { useState, useCallback, useEffect } from 'react';
import { BASE_URL, getProjectId } from './config';

// =============================================================================
// 타입 정의
// =============================================================================

export type StoreOrderStatus =
  | 'PENDING' | 'PAID' | 'FULFILLED' | 'CONFIRMED' | 'FAILED' | 'CANCELED';

export interface StoreConfig {
  store_enabled: boolean;
  toss_client_key: string;
}

export interface StoreCategory {
  id: string;
  product_type: 'DIGITAL' | 'PHYSICAL';
  name: string;
  display_order: number;
}

export interface StoreProduct {
  id: string;
  product_type: 'DIGITAL' | 'PHYSICAL';
  category_id: string | null;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  display_order: number;
}

export interface StoreTerms {
  version: string;
  title: string;
  content: string;
}

export interface StoreOrder {
  id: string;
  order_no: string;
  product_id: string;
  product_type: 'DIGITAL' | 'PHYSICAL';
  product_name: string;
  unit_price: number;
  quantity: number;
  amount: number;
  status: StoreOrderStatus;
  pay_method: string | null;
  receipt_url: string | null;
  fulfillment_note: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
  fulfilled_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

async function parseResponse(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.message || `요청 실패 (${res.status})`);
  }
  return json.data;
}

// =============================================================================
// 스토어 설정 (store_enabled + 토스 클라이언트 키)
// =============================================================================

export function useStoreConfig() {
  const [config, setConfig] = useState<StoreConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/public/store/${getProjectId()}/config`,
          { credentials: 'include' },
        );
        setConfig(await parseResponse(res));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  return { config, isLoading, error };
}

// =============================================================================
// 상품/카테고리 조회 (인증 불필요)
// =============================================================================

export function useStoreProducts() {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async (categoryId?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = categoryId ? `?category_id=${categoryId}` : '';
      const res = await fetch(
        `${BASE_URL}/public/store/${getProjectId()}/products${query}`,
        { credentials: 'include' },
      );
      setProducts(await parseResponse(res));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    const res = await fetch(
      `${BASE_URL}/public/store/${getProjectId()}/categories`,
      { credentials: 'include' },
    );
    setCategories(await parseResponse(res));
  }, []);

  const fetchProductDetail = useCallback(async (productId: string): Promise<StoreProduct> => {
    const res = await fetch(
      `${BASE_URL}/public/store/${getProjectId()}/products/${productId}`,
      { credentials: 'include' },
    );
    return parseResponse(res);
  }, []);

  return { products, categories, isLoading, error, fetchProducts, fetchCategories, fetchProductDetail };
}

// =============================================================================
// 구매 약관 (결제 버튼 위에 표시 + 동의 체크)
// =============================================================================

export function useStoreTerms() {
  const [terms, setTerms] = useState<StoreTerms | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `${BASE_URL}/public/store/${getProjectId()}/terms`,
          { credentials: 'include' },
        );
        setTerms(await parseResponse(res));
      } catch {
        /* 약관 로드 실패 시 결제 버튼을 비활성화 상태로 유지 */
      }
    })();
  }, []);

  return { terms };
}

// =============================================================================
// 체크아웃 — 주문 생성 + 토스 결제창 (위험 구간: 수정 금지)
// =============================================================================

declare global {
  interface Window { TossPayments?: any }
}

const TOSS_SDK_URL = 'https://js.tosspayments.com/v2/standard';
// 결제 준비(prepare)~승인(confirm) 사이 successUrl 리다이렉트로 사라지는 컨텍스트 보관 키
const CHECKOUT_CTX_KEY = 'baas_store_checkout_ctx';

function loadTossSdk(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.TossPayments) return resolve(window.TossPayments);
    const script = document.createElement('script');
    script.src = TOSS_SDK_URL;
    script.onload = () => resolve(window.TossPayments);
    script.onerror = () => reject(new Error('토스 결제 SDK 로드에 실패했습니다.'));
    document.head.appendChild(script);
  });
}

export function useCheckout() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 약관 동의 확인 → 결제 준비(prepare) → 토스 결제창 호출. **주문은 결제 완료(confirm) 시점에 생성된다.**
   * successUrl 리다이렉트로 상태가 사라지므로, confirm에 필요한 정보를 sessionStorage에 보관한다.
   * 성공 시 /checkout/success 로 리다이렉트되므로 이후 코드는 실행되지 않는다.
   */
  const checkout = useCallback(
    async (productId: string, quantity: number, termsAgreed: boolean) => {
      if (!termsAgreed) {
        setError('구매 약관에 동의해주세요.');
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        // 1) 스토어 설정 (클라이언트 키)
        const configRes = await fetch(
          `${BASE_URL}/public/store/${getProjectId()}/config`,
          { credentials: 'include' },
        );
        const config: StoreConfig = await parseResponse(configRes);
        if (!config.store_enabled || !config.toss_client_key) {
          throw new Error('현재 구매할 수 없는 상태입니다.');
        }

        // 2) 결제 준비 — 검증·금액 계산만(주문 미생성). order_no/amount/order_name 발급
        const prepareRes = await fetch(`${BASE_URL}/store/orders/prepare`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: productId, quantity, terms_agreed: true }),
        });
        const prepared: { order_no: string; amount: number; order_name: string } =
          await parseResponse(prepareRes);

        // confirm(주문 생성)에 필요 — 리다이렉트로 사라지는 상태를 보관
        sessionStorage.setItem(
          CHECKOUT_CTX_KEY,
          JSON.stringify({ order_no: prepared.order_no, product_id: productId, quantity }),
        );

        // 3) 토스 결제창 — prepare 응답 금액/주문번호 그대로 사용
        const TossPayments = await loadTossSdk();
        const payment = TossPayments(config.toss_client_key).payment({
          customerKey: TossPayments.ANONYMOUS,
        });
        await payment.requestPayment({
          method: 'CARD',
          amount: { currency: 'KRW', value: prepared.amount },
          orderId: prepared.order_no,
          orderName: prepared.order_name,
          successUrl: `${window.location.origin}/checkout/success`,
          failUrl: `${window.location.origin}/checkout/fail`,
        });
      } catch (e: any) {
        // 사용자가 결제창을 닫은 경우(USER_CANCEL)는 조용히 종료
        if (e?.code === 'USER_CANCEL') return;
        setError(e.message || '결제를 시작하지 못했습니다.');
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  return { checkout, isLoading, error };
}

// =============================================================================
// 결제 승인 — /checkout/success 페이지 전용 (위험 구간: 수정 금지)
// =============================================================================

export function useCheckoutConfirm() {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const paymentKey = params.get('paymentKey');
        const orderId = params.get('orderId');
        const amount = params.get('amount');
        // prepare 단계에서 보관한 정보(주문이 아직 없으므로 confirm에 함께 전달)
        const ctx = JSON.parse(sessionStorage.getItem(CHECKOUT_CTX_KEY) || 'null');
        if (!paymentKey || !orderId || !amount || !ctx) {
          throw new Error('결제 정보가 올바르지 않습니다. 다시 시도해주세요.');
        }
        const res = await fetch(`${BASE_URL}/store/orders/confirm`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payment_key: paymentKey,
            order_id: orderId,
            amount: Number(amount),
            product_id: ctx.product_id,
            quantity: ctx.quantity,
            terms_agreed: true,
          }),
        });
        setOrder(await parseResponse(res));        // 이 시점에 주문(PAID) 생성됨
        sessionStorage.removeItem(CHECKOUT_CTX_KEY);
      } catch (e: any) {
        setError(e.message || '결제 승인에 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    })();
    // 마운트 시 1회만 실행 (서버가 이중 호출을 멱등 처리하지만 재호출하지 않는다)
  }, []);

  return { order, isLoading, error };
}

// =============================================================================
// 내 주문 — 목록/상세/구매확정/취소 (로그인 필요)
// =============================================================================

export function useMyOrders() {
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMine = useCallback(async (status?: StoreOrderStatus) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = status ? `?status=${status}` : '';
      const res = await fetch(`${BASE_URL}/store/orders/me${query}`, {
        credentials: 'include',
      });
      setOrders(await parseResponse(res));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchOrder = useCallback(async (orderId: string): Promise<StoreOrder> => {
    const res = await fetch(`${BASE_URL}/store/orders/${orderId}`, {
      credentials: 'include',
    });
    return parseResponse(res);
  }, []);

  /** 구매확정 — 호출 전 "확정 후 환불 불가" 확인 다이얼로그 필수 */
  const confirmPurchase = useCallback(async (orderId: string): Promise<StoreOrder> => {
    const res = await fetch(`${BASE_URL}/store/orders/${orderId}/confirm`, {
      method: 'POST',
      credentials: 'include',
    });
    return parseResponse(res);
  }, []);

  /** 취소/환불 — CONFIRMED 이후에는 서버가 409 거부 */
  const cancelOrder = useCallback(
    async (orderId: string, reason = '구매자 요청'): Promise<StoreOrder> => {
      const res = await fetch(`${BASE_URL}/store/orders/${orderId}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return parseResponse(res);
    },
    [],
  );

  return { orders, isLoading, error, fetchMine, fetchOrder, confirmPurchase, cancelOrder };
}
