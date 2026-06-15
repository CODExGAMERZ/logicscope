import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface ExplanationResult {
  concept: string;
  explanation: string;
  complexity: {
    time: string;
    space: string;
  };
}

export class AIService {
  private static SECRET_PREFIX = 'logicscope.apiKey.';

  public static async getApiKey(context: vscode.ExtensionContext, provider: string): Promise<string | undefined> {
    return await context.secrets.get(`${this.SECRET_PREFIX}${provider}`);
  }

  public static async saveApiKey(context: vscode.ExtensionContext, provider: string, key: string): Promise<void> {
    await context.secrets.store(`${this.SECRET_PREFIX}${provider}`, key);
  }

  public static async removeApiKey(context: vscode.ExtensionContext, provider: string): Promise<void> {
    await context.secrets.delete(`${this.SECRET_PREFIX}${provider}`);
  }

  public static async validateKey(provider: string, key: string): Promise<boolean> {
    try {
      if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'llama3-8b-8192', // Use small fast model for key validation
            messages: [{ role: 'user', content: 'Ping' }],
            max_tokens: 1
          })
        });
        return response.status === 200;
      } else if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Ping' }] }],
            generationConfig: {
              maxOutputTokens: 1
            }
          })
        });
        return response.status === 200;
      }
      return false;
    } catch (e) {
      Logger.error(`Network error during key validation for ${provider}`, e);
      throw e; // Throw network errors so the caller knows it was a network issue rather than invalid key
    }
  }

  public static async ensureApiKey(context: vscode.ExtensionContext, provider: string): Promise<string | undefined> {
    const existingKey = await this.getApiKey(context, provider);
    if (existingKey) {
      return existingKey;
    }

    const providerName = provider === 'groq' ? 'Groq' : 'Gemini';
    const keyUrl = provider === 'groq' 
      ? 'https://console.groq.com/keys' 
      : 'https://aistudio.google.com/app/apikey';

    const selection = await vscode.window.showInformationMessage(
      `AI explanations need a free API key from ${providerName}. LogicScope never sees or stores this anywhere except your own VS Code secret storage.`,
      'Get a free key',
      'Enter key',
      'Not now'
    );

    if (selection === 'Get a free key') {
      await vscode.env.openExternal(vscode.Uri.parse(keyUrl));
      // Re-prompt after opening browser
      return this.ensureApiKey(context, provider);
    } else if (selection === 'Enter key') {
      const enteredKey = await vscode.window.showInputBox({
        prompt: `Enter your ${providerName} API Key`,
        placeHolder: provider === 'groq' ? 'gsk_...' : 'AIzaSy...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim() === '') {
            return 'API key cannot be empty';
          }
          if (provider === 'groq' && !value.startsWith('gsk_')) {
            return 'Groq API keys typically start with gsk_';
          }
          return null;
        }
      });

      if (enteredKey) {
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: `Validating ${providerName} API Key...`,
          cancellable: false
        }, async () => {
          try {
            const isValid = await this.validateKey(provider, enteredKey);
            if (isValid) {
              await this.saveApiKey(context, provider, enteredKey);
              vscode.window.showInformationMessage(`AI explanations enabled with ${providerName}.`);
            } else {
              vscode.window.showErrorMessage(`This key was rejected by ${providerName} — check for typos or regenerate it.`);
            }
          } catch (e) {
            // Network error
            await this.saveApiKey(context, provider, enteredKey);
            vscode.window.showWarningMessage(`Couldn't verify the key right now due to network error — saved anyway, will retry on next use.`);
          }
        });
        return enteredKey;
      }
    }

    return undefined;
  }

  public static async explainCode(
    code: string,
    language: string,
    provider: string,
    apiKey: string,
    model: string,
    learningMode: 'beginner' | 'advanced'
  ): Promise<ExplanationResult> {
    const systemPrompt = `Analyze the following ${language} code. Identify:
1. Primary concept: recursion / linked list / BFS / inheritance / etc.
2. An explanation suited for a ${learningMode} learner.
3. Time and space complexity.
Return ONLY a JSON object (no markdown formatting, no backticks, no code blocks, no other text):
{
  "concept": "concept name",
  "explanation": "clear explanation",
  "complexity": { "time": "O(...)", "space": "O(...)" }
}`;

    try {
      let responseText = '';
      if (provider === 'groq') {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model || 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: code }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.1
          })
        });

        if (response.status !== 200) {
          const body = await response.text();
          throw new Error(`Groq API returned status ${response.status}: ${body}`);
        }

        const data: any = await response.json();
        responseText = data.choices[0].message.content;
      } else if (provider === 'gemini') {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.0-flash'}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `${systemPrompt}\n\nCode to analyze:\n${code}` }]
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: 0.1
            }
          })
        });

        if (response.status !== 200) {
          const body = await response.text();
          throw new Error(`Gemini API returned status ${response.status}: ${body}`);
        }

        const data: any = await response.json();
        responseText = data.candidates[0].content.parts[0].text;
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }

      // Parse JSON from the response text safely
      // Sometimes models wrap responses in markdown code blocks even if told not to
      const cleanJson = responseText.replace(/```json|```/g, '').trim();
      const parsed: ExplanationResult = JSON.parse(cleanJson);
      return parsed;

    } catch (e) {
      Logger.error(`Error fetching AI explanation from ${provider}`, e);
      throw e;
    }
  }
}
