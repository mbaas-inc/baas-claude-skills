/**
 * 전화번호 형식 유틸.
 *
 * 서버(aiapp-service)는 signup phone 을 검증/정규화 없이 원본 저장한다(≤64자만 강제).
 * 그래서 형식 통일을 클라이언트에 맡기면 폼마다 결과가 갈린다 — SDK 가 전송 직전 한 곳에서
 * 정규화해 서버 관례(휴대폰 하이픈 `010-1234-5678`, recipient_service.normalize_phone_number 와 정합)에
 * 맞춘다. 유효성 "판정"이 아니라 "형식 통일"만 담당하므로 절대 throw 하지 않는다.
 */

/**
 * 전송 직전 정규화. 하이픈 유무·공백 어떤 형태로 들어와도 동일 출력(멱등).
 * 휴대폰(01[0,1,6,7,8,9]) 만 하이픈화하고, 유선·비휴대폰·판단불가는 원본 유지(서버가 원본 저장).
 */
export function normalizePhone(input: string): string {
  if (!input) return input;
  let d = input.replace(/\D/g, "");
  if (d.startsWith("82")) d = "0" + d.slice(2); // +82 국제표기 → 0
  if (/^01[016789]/.test(d)) {
    if (d.length === 11) return d.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3"); // 3-4-4
    if (d.length === 10) return d.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3"); // 3-3-4 (구 01x)
  }
  return input; // 유선·비휴대폰·판단불가 → 원본 그대로
}

/**
 * 입력 중(as-you-type) 자동 하이픈. 부분 입력도 자연스럽게 포맷 → 폼 onChange 용.
 * 빌더 가이드가 이 함수를 가리켜, 에이전트가 즉흥 정규식을 만들지 않게 한다.
 */
export function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}
