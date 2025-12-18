/**
 * BaaS 유틸리티 함수
 */

/**
 * 전화번호 유효성 검사 (010-XXXX-XXXX 형식)
 * @param phone - 검사할 전화번호
 * @returns 유효한 형식이면 true
 */
export function validatePhone(phone: string): boolean {
  return /^010-\d{4}-\d{4}$/.test(phone);
}

/**
 * 전화번호 포맷팅 (010-XXXX-XXXX)
 * @param phone - 포맷팅할 전화번호
 * @returns 포맷팅된 전화번호
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11) {
    return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
  }
  if (cleaned.length === 10) {
    return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
  }
  return phone;
}
