export interface GeminiRequest {
  contents: Array<{
    parts: Array<{
      text: string;
    }>;
  }>;
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason?: Omit<string, 'MAX_TOKENS'> | 'MAX_TOKENS';
  }>;
  error?: {
    message: string;
    code: number;
  };
}
