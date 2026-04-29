/**
 * BaaS 설문조사 React Hook
 *
 * 설문 목록 조회, 상세 조회(질문 포함), 응답 제출을 제공합니다.
 * 목록/상세 조회는 인증 불필요, 응답 제출은 선택적 인증(로그인 시 respondent_id 자동 포함).
 *
 * 사용법:
 * const { surveys, fetchSurveys } = useSurveyList();
 * const { survey, fetchSurvey } = useSurveyDetail();
 * const { submit, isLoading, error } = useSurveySubmit();
 *
 * 환경변수 설정 필요:
 * - REACT_APP_BAAS_PROJECT_ID (React CRA)
 * - NEXT_PUBLIC_BAAS_PROJECT_ID (Next.js)
 * - VITE_BAAS_PROJECT_ID (Vite)
 */

import { useState, useCallback } from 'react';
import { BASE_URL, getProjectId } from './config';

// =============================================================================
// 타입 정의
// =============================================================================

interface SurveyListItem {
  id: string;
  title: string;
  status: 'ACTIVE' | 'CLOSED' | 'DRAFT';
  is_login_required: boolean;
  response_count: number;
  template_theme: 'BASIC' | 'MODERN' | 'ELEGANT';
  share_code: string | null;
  form_url: string | null;
  created_at: string;
}

interface SurveyListResponse {
  items: SurveyListItem[];
  total: number;
  page: number;
  size: number;
}

interface QuestionOption {
  label: string;
  value: string;
}

interface QuestionSettings {
  max_rating: number;
  min_label: string | null;
  max_label: string | null;
}

interface SurveyQuestion {
  id: string;
  question_type: 'SHORT_TEXT' | 'LONG_TEXT' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'DROPDOWN' | 'RATING';
  title: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
  options: QuestionOption[] | null;
  settings: QuestionSettings | null;
}

interface SurveyDetail {
  id: string;
  title: string;
  description: string | null;
  status: string;
  is_login_required: boolean;
  max_responses: number;
  response_count: number;
  template_theme: string;
  share_code: string | null;
  form_url: string | null;
  respondent_name: string | null;
  has_responded: boolean;
  questions: SurveyQuestion[];
  created_at: string;
  updated_at: string | null;
}

interface AnswerSubmitData {
  question_id: string;
  answer_text?: string;
  answer_choice?: string[];
  answer_rating?: number;
}

interface SurveyResponseResult {
  id: string;
  survey_id: string;
  submitted_at: string;
  answers: Array<{
    question_id: string;
    answer_text: string | null;
    answer_choice: string[] | null;
    answer_rating: number | null;
  }>;
}

// =============================================================================
// useSurveyList — 활성 설문 목록 조회
// =============================================================================

interface FetchSurveysOptions {
  page?: number;
  size?: number;
}

interface UseSurveyListReturn {
  surveys: SurveyListResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchSurveys: (options?: FetchSurveysOptions) => Promise<void>;
  getParticipateUrl: (survey: SurveyListItem) => string | null;
}

export function useSurveyList(): UseSurveyListReturn {
  const [surveys, setSurveys] = useState<SurveyListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSurveys = useCallback(async (options: FetchSurveysOptions = {}) => {
    const { page = 1, size = 20 } = options;
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const params = new URLSearchParams({ page: String(page), size: String(size) });
      const res = await fetch(
        `${BASE_URL}/public/survey/${projectId}/surveys?${params}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '목록 조회 실패');
      setSurveys(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getParticipateUrl = useCallback((survey: SurveyListItem): string | null => {
    if (!survey.share_code) return null;
    return `/survey/${survey.share_code}`;
  }, []);

  return { surveys, isLoading, error, fetchSurveys, getParticipateUrl };
}

// =============================================================================
// useSurveyDetail — 설문 상세 + 질문 조회
// =============================================================================

interface UseSurveyDetailReturn {
  survey: SurveyDetail | null;
  isLoading: boolean;
  error: string | null;
  fetchSurvey: (surveyId: string) => Promise<void>;
}

export function useSurveyDetail(): UseSurveyDetailReturn {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSurvey = useCallback(async (surveyId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const res = await fetch(
        `${BASE_URL}/public/survey/${projectId}/surveys/${surveyId}`,
        { credentials: 'include' }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '상세 조회 실패');
      setSurvey(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { survey, isLoading, error, fetchSurvey };
}

// =============================================================================
// useSurveySubmit — 설문 응답 제출
// =============================================================================

interface UseSurveySubmitReturn {
  result: SurveyResponseResult | null;
  isLoading: boolean;
  error: string | null;
  submit: (surveyId: string, answers: AnswerSubmitData[]) => Promise<boolean>;
}

export function useSurveySubmit(): UseSurveySubmitReturn {
  const [result, setResult] = useState<SurveyResponseResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async (surveyId: string, answers: AnswerSubmitData[]): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const projectId = getProjectId();
      const res = await fetch(
        `${BASE_URL}/public/survey/${projectId}/surveys/${surveyId}/responses`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers }),
        }
      );
      const json = await res.json();
      if (json.result !== 'SUCCESS') throw new Error(json.message || '응답 제출 실패');
      setResult(json.data);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, isLoading, error, submit };
}
