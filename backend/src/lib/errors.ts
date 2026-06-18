export class HttpError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message = "Gecersiz istek", details?: unknown): HttpError {
  return new HttpError(400, "BAD_REQUEST", message, details);
}

export function unauthorized(message = "Kimlik dogrulama gerekli"): HttpError {
  return new HttpError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Yetkisiz"): HttpError {
  return new HttpError(403, "FORBIDDEN", message);
}

export function notFound(message = "Bulunamadi"): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflict(message = "Cakisma", details?: unknown): HttpError {
  return new HttpError(409, "CONFLICT", message, details);
}

export function tooManyRequests(message = "Cok fazla istek"): HttpError {
  return new HttpError(429, "TOO_MANY_REQUESTS", message);
}

export function unprocessableEntity(message = "Islenemeyen varlik", details?: unknown): HttpError {
  return new HttpError(422, "UNPROCESSABLE_ENTITY", message, details);
}

export function payloadTooLarge(message = "Dosya cok buyuk"): HttpError {
  return new HttpError(413, "PAYLOAD_TOO_LARGE", message);
}

export function internal(message = "Sunucu hatasi"): HttpError {
  return new HttpError(500, "INTERNAL", message);
}
