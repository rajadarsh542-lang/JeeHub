import type { TutorContext } from "./model";

export interface TutorDataConfig {
  supabaseUrl: string;
  publishableKey: string;
}

type TutorDataErrorCode = "auth" | "question_missing" | "solution_missing" |
  "unsupported_content" | "quota" | "upstream";

export class TutorDataError extends Error {
  constructor(readonly code: TutorDataErrorCode) {
    super(code);
    this.name = "TutorDataError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function boundedJson(response: Response, overflow: TutorDataErrorCode): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new TutorDataError("upstream");
  const decoder = new TextDecoder();
  let size = 0;
  let json = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128 * 1024) {
        await reader.cancel();
        throw new TutorDataError(overflow);
      }
      json += decoder.decode(value, { stream: true });
    }
    return JSON.parse(json + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

// Keep the user's original access token on every request so database RLS still applies.
async function request(
  config: TutorDataConfig, token: string, path: string, method: "GET" | "POST" = "GET",
  overflow: TutorDataErrorCode = "upstream",
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL(path, config.supabaseUrl), {
      method, redirect: "error", cache: "no-store", signal: controller.signal,
      headers: {
        apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    if (response.status === 401 || response.status === 403) throw new TutorDataError("auth");
    if (!response.ok) throw new TutorDataError("upstream");
    return await boundedJson(response, overflow);
  } catch (error) {
    if (error instanceof TutorDataError) throw error;
    throw new TutorDataError("upstream");
  } finally {
    clearTimeout(timeout);
  }
}

export async function requireTutorUser(config: TutorDataConfig, token: string): Promise<void> {
  const user = await request(config, token, "/auth/v1/user");
  if (!isRecord(user) || typeof user.id !== "string" || !user.id ||
      user.role !== "authenticated" || user.is_anonymous === true) throw new TutorDataError("auth");
}

// Only send text to the tutor. A diagram or external reference needs an editorial
// text equivalent first; dropping a figure could change the mathematics.
const externalOrMedia = /!\s*\[|<\s*(?:img|svg|picture|figure|video|iframe|object|embed|audio)\b|\\includegraphics\b|(?:https?:\/\/|data:(?:image|video)\/)|\.(?:png|jpe?g|gif|svg|webp|avif)(?:[\s?#)"']|$)/i;

function referenceText(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new TutorDataError("unsupported_content");
  const text = value.trim();
  if (externalOrMedia.test(text)) throw new TutorDataError("unsupported_content");
  return text;
}

export async function loadTutorContext(
  config: TutorDataConfig, token: string, questionId: string,
): Promise<TutorContext> {
  const query = new URLSearchParams({
    select: "id,is_published,content_revision,stem_md,options,verified_solutions(question_revision,answer_md,solution_md)",
    id: `eq.${questionId}`, is_published: "eq.true", limit: "1",
  });
  const rows = await request(config, token, `/rest/v1/questions?${query}`, "GET", "unsupported_content");
  if (!Array.isArray(rows)) throw new TutorDataError("upstream");
  if (!rows.length) throw new TutorDataError("question_missing");
  const row: unknown = rows[0];
  if (!isRecord(row) || row.id !== questionId.toLowerCase() || row.is_published !== true ||
      typeof row.content_revision !== "number" || !Number.isSafeInteger(row.content_revision) || row.content_revision < 1 || !Array.isArray(row.verified_solutions) ||
      !Array.isArray(row.options)) throw new TutorDataError("upstream");
  const solution: unknown = row.verified_solutions.find((s: unknown) =>
    isRecord(s) && s.question_revision === row.content_revision);
  if (!isRecord(solution)) throw new TutorDataError("solution_missing");

  const question = referenceText(row.stem_md);
  const options = row.options.map((option: unknown) => {
    if (!isRecord(option)) throw new TutorDataError("upstream");
    return `${referenceText(option.id)}: ${referenceText(option.content_md)}`;
  });
  const answer = referenceText(solution.answer_md);
  const workedSolution = referenceText(solution.solution_md);
  if (question.length + options.join("").length + answer.length + workedSolution.length > 16000) {
    throw new TutorDataError("unsupported_content");
  }

  const paragraphs = workedSolution.split(/\r?\n\s*\r?\n/);
  if (paragraphs.length > 64) throw new TutorDataError("unsupported_content");
  return {
    revision: row.content_revision, question, options,
    passages: [
      { id: "answer", text: answer },
      ...paragraphs.map((text, i) => ({ id: `solution-${i + 1}`, text: text.trim() })),
    ],
  };
}

export async function takeTutorQuota(config: TutorDataConfig, token: string): Promise<void> {
  const allowed = await request(config, token, "/rest/v1/rpc/consume_tutor_request", "POST");
  if (allowed === false) throw new TutorDataError("quota");
  if (allowed !== true) throw new TutorDataError("upstream");
}
