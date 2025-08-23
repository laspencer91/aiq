import { BaseProviderConfig, UserError } from '../../../types';
import { DistinctQuestion } from 'inquirer';
import { GeminiRequest, GeminiResponse } from './gemini-provider.types';
import { IAiProvider } from '../provider.interface';
import { Provider } from '../provider-discovery';

export interface GeminiProviderConfig extends BaseProviderConfig {
  name: 'gemini';
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

@Provider<GeminiProviderConfig>('Gemini', {
  name: 'gemini',
  apiKey: '${GEMINI_API_KEY}',
  model: 'gemini-2.5-flash',
  temperature: 0.7,
  maxTokens: 500,
})
export class GeminiProvider extends IAiProvider<GeminiProviderConfig> {
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  public validateConfig(): void {
    if (!this.config.apiKey || this.config.apiKey.startsWith('${')) {
      throw new UserError(
        'Gemini API key not configured',
        'Set the GEMINI_API_KEY environment variable or add it to your config file.',
      );
    }

    if (!this.config.model) {
      throw new UserError(
        'Gemini model not specified in config',
        'Add a model like "gemini-1.5-pro" to your provider config',
      );
    }
  }

  async executePrompt(prompt: string): Promise<string> {
    const url = `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const request: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxTokens,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        await this.handleErrorResponse(response);
      }

      const data = (await response.json()) as GeminiResponse;

      if (data.error) {
        throw new UserError(
          `Gemini API error: ${data.error.message}`,
          this.getErrorHint(data.error.code),
        );
      }

      if (!data.candidates || data.candidates.length === 0) {
        throw new UserError('No response from Gemini', 'Try rephrasing your prompt');
      }

      const text = data.candidates[0].content.parts[0].text;
      return text.trim();
    } catch (error: unknown) {
      if (error instanceof UserError) {
        throw error;
      }

      if ((error as { code: string }).code === 'ECONNREFUSED') {
        throw new UserError('Cannot connect to Gemini API', 'Check your internet connection');
      }

      if ((error as { code: string }).code === 'ETIMEDOUT') {
        throw new UserError('Request to Gemini timed out', 'Try again in a moment');
      }

      throw new UserError(
        `API request failed: ${(error as Error).message}`,
        'Check your configuration and try again',
      );
    }
  }

  private async handleErrorResponse(response: Response): Promise<void> {
    const status = response.status;
    let message = `HTTP ${status} error`;
    let hint = '';

    switch (status) {
      case 400:
        message = 'Invalid request to Gemini';
        hint = 'Check your model name and parameters';
        break;
      case 401:
        message = 'Invalid API key';
        hint = 'Check your GEMINI_API_KEY environment variable';
        break;
      case 403:
        message = 'Access forbidden';
        hint = 'Ensure your API key has the necessary permissions';
        break;
      case 404:
        message = 'Model not found';
        hint = `Model '${this.config.model}' may not exist. Try 'gemini-2.0-flash'`;
        break;
      case 429:
        message = 'Rate limit exceeded';
        hint = 'Wait a moment and try again';
        break;
      case 500:
      case 502:
      case 503:
        message = 'Gemini service error';
        hint = 'The service may be temporarily down. Try again later';
        break;
    }

    // Try to get more details from response body
    try {
      const errorBody = await response.text();
      const errorJson = JSON.parse(errorBody) as { error?: Error };
      if (errorJson.error?.message) {
        message = errorJson.error.message;
      }
    } catch {
      // Ignore parsing errors
    }

    throw new UserError(message, hint);
  }

  private getErrorHint(code: number): string {
    const hints: Record<number, string> = {
      400: 'Check your prompt format',
      401: 'Verify your API key',
      403: 'Check API key permissions',
      404: 'Verify the model name',
      429: "You're sending too many requests. Wait a bit",
      500: 'Gemini is having issues. Try again later',
    };

    return hints[code] || 'Try again or check your configuration';
  }

  async validateConnection(): Promise<boolean> {
    try {
      // Try a minimal request to check if API key and model are valid
      await this.executePrompt('Hi');
      return true;
    } catch (error) {
      if (error instanceof UserError) {
        throw error;
      }
      return false;
    }
  }

  public getInitQuestions(): DistinctQuestion[] {
    return [
      {
        type: 'input',
        name: 'apiKey',
        message: 'Enter your Gemini API key:',
        validate: (input: string) => {
          if (!input) {
            return 'API key is required';
          }
          if (input.length < 20) {
            return "That doesn't look like a valid API key";
          }
          return true;
        },
        transformer: (input: string) => {
          // Hide the API key as it's typed
          return input.replace(/./g, '*');
        },
      },
      {
        type: 'list',
        name: 'model',
        message: 'Select Gemini model:',
        choices: [
          { name: 'Gemini 2.0 Flash (Recommended)', value: 'gemini-2.0-flash' },
          { name: 'Gemini 2.5 Flash Lite (Faster)', value: 'gemini-2.5-flash-lite' },
          { name: 'Gemini 1.5 Pro (More capable)', value: 'gemini-1.5-pro' },
        ],
        default: this.getDefaultConfig()?.model ?? 'gemini-2.0-flash',
      },
    ];
  }
}
