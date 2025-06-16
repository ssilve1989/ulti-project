const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export abstract class BaseApi {
  protected async makeRequest(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      credentials: 'include', // Include session cookies for better-auth
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      // Handle structured error response from API spec
      const errorData = await response.json();
      throw new Error(
        errorData.error?.message || `API Error: ${response.status}`,
      );
    }
    return response.json();
  }

  protected buildQueryParams(params: Record<string, any>): string {
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    }
    return queryParams.toString();
  }
}
