import { ServiceError } from "./services/errors.ts";

export function errorResponse(error: unknown): Response {
  if (error instanceof ServiceError) {
    const headers: Record<string, string> = {};
    if (error.statusCode === 429) headers["Retry-After"] = "60";
    return Response.json({ error: error.message, code: error.code }, { status: error.statusCode, headers });
  }
  console.error("Erro não tratado na API:", error);
  return Response.json({ error: "Não foi possível concluir a solicitação agora.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expectedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host")?.trim();
  if (!expectedHost) return;
  try {
    if (new URL(origin).host.toLowerCase() !== expectedHost.toLowerCase()) {
      throw new ServiceError("Origem da solicitação não autorizada.", 403, "CSRF_ORIGIN_MISMATCH");
    }
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("Origem da solicitação inválida.", 403, "CSRF_ORIGIN_MISMATCH");
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new ServiceError("O corpo da solicitação deve ser um JSON válido.", 400, "INVALID_JSON");
  }
}
