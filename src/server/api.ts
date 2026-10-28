import { ServiceError } from "./services/errors.ts";

export function errorResponse(error: unknown): Response {
  if (error instanceof ServiceError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.statusCode });
  }
  console.error("Erro não tratado na API:", error);
  return Response.json({ error: "Não foi possível concluir a solicitação agora.", code: "INTERNAL_ERROR" }, { status: 500 });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new ServiceError("O corpo da solicitação deve ser um JSON válido.", 400, "INVALID_JSON");
  }
}
