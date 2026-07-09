/** 설문조사 — 공개 목록/상세 + 응답 제출. */
import { request } from "./http";
import { getProjectId } from "./config";

export interface Survey {
  id: string;
  title: string;
  share_code?: string;
  form_url?: string;
  status?: string;
  [key: string]: unknown;
}

export function listSurveys(params: Record<string, string> = {}): Promise<{ items: Survey[]; [k: string]: unknown }> {
  const qs = new URLSearchParams(params).toString();
  return request(`/public/survey/${getProjectId()}/surveys${qs ? `?${qs}` : ""}`);
}

export function getSurvey(surveyId: string): Promise<Survey> {
  return request(`/public/survey/${getProjectId()}/surveys/${surveyId}`);
}

export function submitSurveyResponse(
  surveyId: string,
  answers: unknown
): Promise<unknown> {
  return request(`/public/survey/${getProjectId()}/surveys/${surveyId}/responses`, {
    method: "POST",
    body: { answers },
  });
}
