import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "EXTERNAL_API_ERROR"
  | "DATABASE_ERROR"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR";

export class ApiHttpError extends Error {
  status: number;
  code: ApiErrorCode;
  details?: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? [],
      },
    },
    { status }
  );
}

export function handleApiError(error: unknown) {
  if (error instanceof ApiHttpError) {
    return errorResponse(error.status, error.code, error.message, error.details);
  }

  const message = error instanceof Error ? error.message : "Unexpected server error.";
  return errorResponse(500, "INTERNAL_ERROR", message);
}
