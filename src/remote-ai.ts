import type { RawEvent, WorkflowAnalysis } from './types';

// Default Claude API endpoint and version
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-7-sonnet-latest';

// Get API key from environment variables - must use VITE_ prefix and import.meta.env
const CLAUDE_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY || '';

// If the key is not available, log a helpful message
if (!CLAUDE_API_KEY) {
  console.warn(
    'VITE_ANTHROPIC_API_KEY not found in environment variables. ' +
      'Make sure you have a .env file in the project root with VITE_ANTHROPIC_API_KEY=your_api_key',
  );
}

// Settings key for UI state
const USE_REMOTE_AI = 'use_remote_ai'; // Matches the key used in UI components

/**
 * Check if the remote API is configured and available
 * @returns Promise that resolves to true if API key is set
 */
export async function isRemoteAIConfigured(): Promise<boolean> {
  try {
    console.log('Checking if Remote AI is configured...');
    return !!CLAUDE_API_KEY;
  } catch (error) {
    console.error('Error checking Remote AI configuration:', error);
    return false;
  }
}

/**
 * Get the API key from environment variables
 * @returns The API key
 */
export function getApiKey(): string {
  return CLAUDE_API_KEY;
}

/**
 * Check if remote AI is enabled
 */
export async function isRemoteAIEnabled(): Promise<boolean> {
  return new Promise(resolve => {
    chrome.storage.local.get([USE_REMOTE_AI], result => {
      resolve(result[USE_REMOTE_AI] === true);
    });
  });
}

/**
 * Enable or disable remote AI
 * @param enabled Whether to enable remote AI
 */
export async function setRemoteAIEnabled(enabled: boolean): Promise<void> {
  return new Promise(resolve => {
    chrome.storage.local.set({ [USE_REMOTE_AI]: enabled }, () => {
      resolve();
    });
  });
}

/**
 * Test the Claude API with a simple prompt
 * @returns Promise with diagnostic information
 */
export async function testRemoteAI(): Promise<{
  success: boolean;
  error?: string;
  response?: string;
  prompt: string;
}> {
  const testResult: {
    success: boolean;
    error?: string;
    response?: string;
    prompt: string;
  } = {
    success: false,
    prompt: 'Hello, this is a test prompt. Please respond with "Test successful".',
  };

  try {
    console.log('Running Claude API diagnostic test...');

    // Check if API key is configured
    const apiKey = getApiKey();
    if (!apiKey) {
      testResult.error =
        'Claude API key not configured. Please add VITE_ANTHROPIC_API_KEY to your .env file.';
      return testResult;
    }

    // Try a simple prompt
    const result = await callClaudeAPI(testResult.prompt, apiKey);

    if (!result) {
      testResult.error = 'Received empty response from Claude API';
    } else {
      testResult.success = true;
      testResult.response = result;
    }
  } catch (error) {
    testResult.error = error instanceof Error ? error.message : 'Unknown error';
  }

  return testResult;
}

/**
 * Format events into a human-readable description for the AI prompt
 * @param events Array of events to format
 * @returns Formatted string describing the events
 */
function formatEventsForPrompt(events: RawEvent[]): string {
  return events
    .filter(event => event.type !== 'mark') // Filter out mark events
    .map((event, index) => {
      const timestamp = new Date(event.t).toLocaleTimeString();

      switch (event.type) {
        case 'user':
          return `Step ${index + 1} [${timestamp}]: User ${event.action} on ${event.target}${event.value ? ` with value "${event.value}"` : ''}`;

        case 'nav':
          return `Step ${index + 1} [${timestamp}]: User navigated to ${event.url}`;

        case 'tab':
          if (event.action === 'activated' && event.title) {
            return `Step ${index + 1} [${timestamp}]: Tab was ${event.action} - "${event.title}"`;
          }
          return `Step ${index + 1} [${timestamp}]: Tab was ${event.action}`;

        case 'hashchange':
          return `Step ${index + 1} [${timestamp}]: User navigated to anchor link from ${event.from} to ${event.to}`;

        case 'page':
          return `Step ${index + 1} [${timestamp}]: Page ${event.action} at ${event.url}`;

        case 'key': {
          const modifiers = [];
          if (event.modifiers.ctrl) modifiers.push('Ctrl');
          if (event.modifiers.alt) modifiers.push('Alt');
          if (event.modifiers.shift) modifiers.push('Shift');
          if (event.modifiers.meta) modifiers.push('Meta');

          const keyCombo = modifiers.length ? `${modifiers.join('+')}+${event.key}` : event.key;

          return `Step ${index + 1} [${timestamp}]: User pressed ${keyCombo}`;
        }

        case 'xhr':
        case 'fetch':
          return `Step ${index + 1} [${timestamp}]: ${event.type ? event.type.toUpperCase() : 'API'} ${event.method || 'unknown'} request to ${event.url || 'unknown URL'}`;

        default:
          return `Step ${index + 1} [${timestamp}]: ${JSON.stringify(event)}`;
      }
    })
    .join('\n');
}

/**
 * Create a prompt for Claude based on the workflow events
 * @param events Array of events in the workflow
 * @param customPrompt Optional custom prompt to use instead of the default
 * @returns Formatted prompt string
 */
function createPrompt(events: RawEvent[], customPrompt?: string): string {
  const formattedEvents = formatEventsForPrompt(events);

  if (customPrompt) {
    return `${customPrompt}\n\nWorkflow:\n${formattedEvents}`;
  }

  return `
You are an expert in analyzing user workflows in web applications. I'll provide you with a sequence of user interactions, and I need you to:

1. Identify the overall goal/purpose of this workflow - it should be generalizable to similar workflows.
2. For each significant action, explain what the user was trying to accomplish
3. Provide any suggestions on what someone should look out for when executing this workflow, how to optimize it, or any potential pitfalls.

Your analysis should be structured as follows:
{
  "steps": [
    {
      "action": "What the user did",
      "intent": "Why they did it / what they were trying to accomplish"
    }
  ],
  "summary": "Brief description of the overall workflow purpose - generalizable to similar workflows",
  "suggestions": [
    "E.g. What to look out for when executing this workflow",
    "E.g. How to optimize the workflow",
    "E.g. What to do when it doesn't work as expected"
  ]
}

Here is the workflow sequence:

${formattedEvents}

Respond with only valid JSON. (No explanations, no additional text, just the JSON response. No markdown or code blocks.)
`;
}

/**
 * Call the Claude API with a prompt
 * @param prompt The prompt to send to Claude
 * @param apiKey The API key to use
 * @returns Promise that resolves to Claude's response
 */
async function callClaudeAPI(prompt: string, apiKey: string): Promise<string> {
  try {
    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // Required header for direct browser access to Anthropic API
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    throw error;
  }
}

/**
 * Analyze a workflow using the Claude API
 * @param events Array of events in the workflow to analyze
 * @param customPrompt Optional custom prompt to use
 * @returns Promise that resolves to a WorkflowAnalysis object
 */
export async function analyzeWorkflow(
  events: RawEvent[],
  customPrompt?: string,
): Promise<WorkflowAnalysis> {
  // Generate the prompt early to include in error responses
  const prompt = createPrompt(events, customPrompt);

  try {
    console.log('Analyzing workflow with Claude API, events count:', events.length);

    // Get the API key from environment
    const apiKey = getApiKey();
    if (!apiKey) {
      return {
        summary: 'Error: Claude API key not configured',
        steps: [
          {
            action: 'Configuration Error',
            intent: 'Claude API key not found in environment variables',
          },
        ],
        debug: {
          prompt,
          error:
            'Claude API key not configured. Please add VITE_ANTHROPIC_API_KEY to your .env file.',
          modelStatus: 'not configured',
        },
      };
    }

    // Send the prompt to Claude
    console.log('Sending prompt to Claude API:', `${prompt.substring(0, 100)}...`);

    try {
      const result = await callClaudeAPI(prompt, apiKey);
      console.log('Received response from Claude API:', `${result.substring(0, 100)}...`);

      // Parse the response as JSON
      try {
        if (!result) {
          console.error('Empty or undefined response from Claude API');
          return {
            summary: 'Error with Claude API response',
            steps: [
              {
                action: 'Empty response from Claude API',
                intent: 'The API returned an empty or undefined response',
              },
            ],
            debug: {
              prompt,
              error: 'Empty or undefined response from Claude API',
              rawResponse: 'undefined',
              modelStatus: 'error',
            },
          };
        }

        const analysis = JSON.parse(result) as WorkflowAnalysis;

        // Add debug info to the successful response
        analysis.debug = {
          prompt,
          modelStatus: 'available',
          rawResponse: result,
        };

        return analysis;
      } catch (parseError) {
        console.error('Error parsing Claude API response:', parseError);

        // Return a default analysis with the error
        return {
          summary: 'Error parsing Claude API response',
          steps: [
            {
              action: 'Failed to parse API response',
              intent: 'The API response was not valid JSON. Try adjusting the prompt.',
            },
          ],
          debug: {
            prompt,
            error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
            rawResponse: result || 'undefined or empty response',
            modelStatus: 'error',
          },
        };
      }
    } catch (apiError) {
      console.error('Error calling Claude API:', apiError);

      return {
        summary: 'Error calling Claude API',
        steps: [
          {
            action: 'API call failed',
            intent: apiError instanceof Error ? apiError.message : 'Unknown API error',
          },
        ],
        debug: {
          prompt,
          error: apiError instanceof Error ? apiError.message : 'Unknown API error',
          modelStatus: 'error',
        },
      };
    }
  } catch (error) {
    console.error('Error in remote AI workflow analysis:', error);

    // Return a default analysis with the error
    return {
      summary: 'Error analyzing workflow with Claude API',
      steps: [
        {
          action: 'Error in analysis process',
          intent: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      ],
      debug: {
        prompt,
        error: error instanceof Error ? error.message : 'Unknown error',
        modelStatus: 'error',
      },
    };
  }
}
