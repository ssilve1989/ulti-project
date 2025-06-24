// NOTE: Cookie-based authentication setup
// - No token parameter in config (removed)
// - No Authorization header setup (removed) 
// - Must include credentials: 'include' in fetch requests
// - EventSource must use withCredentials: true

export interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

export class BaseHttpClient {
  protected readonly config: HttpClientConfig;
  
  constructor(config: HttpClientConfig) {
    this.config = {
      timeout: 10000,
      retries: 3,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      ...config,
    };
  }

  protected async request<T>(options: RequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.params);
    const requestInit = this.buildRequestInit(options);
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= this.config.retries!; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, requestInit);
        
        if (!response.ok) {
          throw await this.handleHttpError(response);
        }
        
        const result = await response.json();
        return result as T;
        
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retries! && this.shouldRetry(error as Error)) {
          await this.delay(2 ** attempt * 1000);
          continue;
        }
        
        break;
      }
    }
    
    throw lastError!;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.config.baseUrl);

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
      }
    }
    
    return url.toString();
  }

  private buildRequestInit(options: RequestOptions): RequestInit {
    const headers = {
      ...this.config.headers,
      ...options.headers,
    };

    const init: RequestInit = {
      method: options.method,
      headers,
      credentials: 'include', // Cookie-based authentication
    };

    if (options.body) {
      init.body = JSON.stringify(options.body);
    }

    return init;
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleHttpError(response: Response): Promise<Error> {
    try {
      const errorData = await response.json();
      const { ApiError } = await import('./errors.js');
      return ApiError.fromResponse(response.status, errorData);
    } catch {
      const { ApiError } = await import('./errors.js');
      return new ApiError(
        response.statusText || 'Unknown error',
        response.status
      );
    }
  }

  private shouldRetry(error: Error): boolean {
    // Retry on network errors and 5xx status codes
    if (error.name === 'AbortError') return false; // Don't retry timeouts

    // Check if this is an ApiError with status code
    if (error.name === 'ApiError') {
      const apiError = error as any;
      return apiError.isServerError?.();
    }
    
    // Network error or other non-API error
    return true;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Server-Sent Events support
  protected createEventSource(path: string, params?: Record<string, string>): EventSource {
    const url = this.buildUrl(path, params);
    
    // Note: EventSource with cookie-based authentication
    return new EventSource(url, {
      withCredentials: true
    });
  }
}