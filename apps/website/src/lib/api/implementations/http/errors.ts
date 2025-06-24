export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static fromResponse(status: number, data: any): ApiError {
    return new ApiError(
      data.message || `HTTP ${status} Error`,
      status,
      data.code,
      data.details
    );
  }

  isNotFound(): boolean {
    return this.status === 404;
  }

  isUnauthorized(): boolean {
    return this.status === 401;
  }

  isForbidden(): boolean {
    return this.status === 403;
  }

  isServerError(): boolean {
    return this.status >= 500;
  }
}