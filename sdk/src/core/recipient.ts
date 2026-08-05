/** 발송대상(연락처) 등록 — POST /recipient/{projectId} */
import { request } from "./http";
import { getProjectId } from "./config";
import { normalizePhone } from "./phone";

export interface RecipientInput {
  name: string;
  phone: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export function registerRecipient(input: RecipientInput): Promise<unknown> {
  return request(`/recipient/${getProjectId()}`, {
    method: "POST",
    body: {
      name: input.name,
      phone: normalizePhone(input.phone),
      description: input.description || " ",
      data: input.metadata ? JSON.stringify(input.metadata) : "{}",
    },
  });
}
