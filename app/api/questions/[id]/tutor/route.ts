import { loadTutorContext, requireTutorUser, takeTutorQuota, TutorDataError } from '../../../../../lib/tutor/data';
import { explainQuestion, TutorModelError } from '../../../../../lib/tutor/model';

export const runtime = 'nodejs';
export const maxDuration = 60;

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const maxBodyBytes = 8192;
const maxMessageLength = 1600;
const noStore = { 'Cache-Control': 'no-store' };

interface TutorRequest {
  message: string;
}

const dataFailures = {
  auth: [401, 'Sign in to use the tutor.'],
  question_missing: [404, 'This question is unavailable.'],
  solution_missing: [409, 'This question does not have a current verified solution yet.'],
  unsupported_content: [422, 'The tutor needs a text explanation it can use for this question.'],
  quota: [429, 'Your daily tutor allowance has been used. Try again after 00:00 UTC.'],
  upstream: [503, 'The question service is temporarily unavailable.'],
} as const;

function failure(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status, headers: noStore });
}

class BodyTooLarge extends Error {}

async function readInput(request: Request): Promise<TutorRequest | null> {
  if (Number(request.headers.get('content-length')) > maxBodyBytes) throw new BodyTooLarge();
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBodyBytes) {
        void reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    const value: unknown = JSON.parse(text + decoder.decode());
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 ||
        !('message' in value) || typeof value.message !== 'string') return null;
    const message = value.message.trim();
    return message && message.length <= maxMessageLength ? { message } : null;
  } catch (error) {
    if (error instanceof BodyTooLarge) throw error;
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }): Promise<Response> {
  if (!uuid.test(params.id)) return failure(400, 'invalid_id', 'Use the question UUID from Supabase.');
  const token = /^Bearer ([^\s,]+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  if (!token) return failure(401, 'auth', dataFailures.auth[1]);
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return failure(415, 'content_type', 'Send the message as application/json.');
  }

  try {
    const input = await readInput(request);
    if (!input) return failure(400, 'invalid_message', 'Send one message between 1 and 1600 characters.');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !publishableKey) return failure(503, 'configuration', 'The tutor is not configured.');
    const config = { supabaseUrl, publishableKey };
    await requireTutorUser(config, token);
    const context = await loadTutorContext(config, token, params.id);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return failure(503, 'configuration', 'The tutor is not configured.');
    await takeTutorQuota(config, token);
    const result = await explainQuestion(context, input.message, apiKey);
    return Response.json({ questionId: params.id.toLowerCase(), questionRevision: context.revision, ...result }, { headers: noStore });
  } catch (error) {
    if (error instanceof BodyTooLarge) return failure(413, 'body_too_large', 'Send at most 8192 bytes.');
    if (error instanceof TutorDataError) {
      const [status, message] = dataFailures[error.code];
      return failure(status, error.code, message);
    }
    if (error instanceof TutorModelError) {
      return failure(error.code === 'timeout' ? 504 : 502, error.code, 'The tutor could not finish this reply.');
    }
    return failure(500, 'internal', 'The tutor could not complete this request.');
  }
}
