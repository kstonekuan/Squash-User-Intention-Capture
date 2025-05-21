import type { RawEvent, WorkflowAnalysis } from './types';

// Define types for Chrome LanguageModel API
// These types are not yet available in @types/chrome
declare global {
  interface Window {
    chrome: typeof chrome;
  }

  interface LanguageModelPromptOptions {
    temperature?: number;
    topK?: number;
    signal?: AbortSignal;
    initialPrompts?: Array<{
      role: 'system' | 'user' | 'model';
      content: string;
    }>;
  }

  class LanguageModelSession {
    prompt(prompt: string): Promise<string>;
    promptStreaming(prompt: string): ReadableStream<string>;
    destroy(): void;
    clone(): Promise<LanguageModelSession>;
  }

  // LanguageModel is a global object, not part of chrome
  class LanguageModel {
    static create(options?: LanguageModelPromptOptions): Promise<LanguageModelSession>;
    static params(): Promise<{ defaultTemperature: number; defaultTopK: number; maxTopK: number }>;
    static availability(): Promise<'no' | 'readily' | 'available' | 'after-download'>;
  }
}

/**
 * Check if the AI model is available
 * @returns Promise that resolves to true if the model is available
 */
export async function isAIModelAvailable(): Promise<boolean> {
  try {
    console.log('Checking AI model availability...');

    // Check if Chrome exists
    if (typeof chrome === 'undefined') {
      console.error('Chrome API is not available');
      return false;
    }

    // Check if the LanguageModel API exists at runtime as global object
    if (typeof LanguageModel === 'undefined') {
      console.error('LanguageModel API is not available in this browser');
      return false;
    }

    // Check actual availability status
    console.log('Checking model availability status...');
    try {
      const available = await LanguageModel.availability();
      console.log('Model availability status:', available);

      if (available === 'no') {
        console.error('AI model not available, status:', available);
        return false;
      }

      // Try to get the model parameters as an additional check
      try {
        const params = await LanguageModel.params();
        console.log('Model parameters available:', params);
      } catch (paramsError) {
        console.error('Error getting model parameters:', paramsError);
      }

      return true;
    } catch (availabilityError) {
      console.error('Error checking availability status:', availabilityError);
      return false;
    }
  } catch (error) {
    console.error('Error checking AI model availability:', error);
    return false;
  }
}

/**
 * Test the AI model with a simple prompt to diagnose issues
 * @returns Promise with diagnostic information
 */
export async function testAIModel(): Promise<{
  success: boolean;
  modelStatus: string;
  error?: string;
  response?: string;
  prompt: string;
}> {
  const diagnosticResult: {
    success: boolean;
    modelStatus: string;
    error?: string;
    response?: string;
    prompt: string;
  } = {
    success: false,
    modelStatus: 'unknown',
    prompt: 'Hello, this is a test prompt. Please respond with "Test successful".',
  };

  try {
    console.log('Running AI model diagnostic test...');

    // Check API existence
    if (typeof LanguageModel === 'undefined') {
      diagnosticResult.error = 'LanguageModel API is not available in this browser';
      return diagnosticResult;
    }

    let available;
    // Check availability
    try {
      available = await LanguageModel.availability();
      diagnosticResult.modelStatus = available;

      if (available === 'no') {
        diagnosticResult.error = `Model not available (status: ${available})`;
        return diagnosticResult;
      }
    } catch (availabilityError) {
      diagnosticResult.error = `Error checking availability: ${
        availabilityError instanceof Error ? availabilityError.message : 'Unknown error'
      }`;
      return diagnosticResult;
    }

    // Try to create a session
    let session;
    try {
      console.log('Creating model session...');

      // Get the default parameters
      const params = await LanguageModel.params();
      console.log('Model params:', params);

      if (available === 'after-download') {
        console.error('Model will take time to download');
      }

      // Create with explicit parameters for more reliability
      session = await LanguageModel.create({
        initialPrompts: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
          },
        ],
      });

      console.log('Session created successfully');
    } catch (sessionError) {
      diagnosticResult.error = `Error creating model session: ${
        sessionError instanceof Error ? sessionError.message : 'Unknown error'
      }`;
      return diagnosticResult;
    }

    // Try a simple prompt
    try {
      console.log('Sending test prompt to model...');
      const result = await session.prompt(diagnosticResult.prompt);
      console.log('Response received:', result);

      if (result === undefined) {
        diagnosticResult.error = 'Received empty or undefined response from model';
        diagnosticResult.response = 'undefined';
      } else {
        diagnosticResult.success = true;
        diagnosticResult.response = result; // Using the result directly
      }
    } catch (promptError) {
      diagnosticResult.error = `Error sending prompt: ${
        promptError instanceof Error ? promptError.message : 'Unknown error'
      }`;
    } finally {
      // Clean up session
      if (session) {
        try {
          session.destroy();
        } catch (e) {
          console.error('Error destroying session:', e);
        }
      }
    }

    return diagnosticResult;
  } catch (error) {
    diagnosticResult.error = `Unexpected error during test: ${
      error instanceof Error ? error.message : 'Unknown error'
    }`;
    return diagnosticResult;
  }
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
          return `Step ${index + 1} [${timestamp}]: Tab was ${event.action}`;

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
 * Create a prompt for the AI model based on the workflow events
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

1. Identify the overall goal/purpose of this workflow, so that a browser agent can use it replicate the user's actions.
2. For each significant action, explain what the user was trying to accomplish
3. Suggest any potential optimizations or shortcuts a browser agent could use to achieve the same result more efficiently.

Your analysis should be structured as follows:
{
  "summary": "Brief description of the overall workflow purpose",
  "steps": [
    {
      "action": "What the user did",
      "intent": "Why they did it / what they were trying to accomplish"
    }
  ],
  "suggestions": [
    "Suggestion 1 for optimization",
    "Suggestion 2 for optimization"
  ]
}

Here is the workflow sequence:

${formattedEvents}

Respond with only valid JSON.
`;
}

/**
 * Analyze a workflow using the Chrome Language Model API
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
  let modelStatus = 'unknown';

  try {
    console.log('Analyzing workflow with events:', events.length);

    // Check model parameters
    let defaults;
    try {
      defaults = await LanguageModel.params();
      console.log('Model defaults:', defaults);
    } catch (paramsError) {
      console.error('Error getting model parameters:', paramsError);

      return {
        summary: 'Error analyzing workflow',
        steps: [
          {
            action: 'Error getting model parameters',
            intent: paramsError instanceof Error ? paramsError.message : 'Unknown error',
          },
        ],
        debug: {
          prompt,
          error:
            paramsError instanceof Error
              ? `${paramsError.name}: ${paramsError.message}\n${paramsError.stack || ''}`
              : String(paramsError),
          modelStatus: 'unavailable - params error',
        },
      };
    }

    // Check model availability
    try {
      const available = await LanguageModel.availability();
      modelStatus = available;
      console.log('Model availability status:', available);

      if (available === 'no') {
        console.error('AI model is not available:', available);
        return {
          summary: 'Error: AI model not available',
          steps: [
            {
              action: 'AI Model Unavailable',
              intent: `Current status: ${available}. Please ensure you're using Chrome 131+.`,
            },
          ],
          debug: {
            prompt,
            error: `Model not available. Status: ${available}`,
            modelStatus: available,
          },
        };
      }
    } catch (availabilityError) {
      console.error('Error checking model availability:', availabilityError);

      return {
        summary: 'Error checking AI model availability',
        steps: [
          {
            action: 'Error determining model availability',
            intent:
              availabilityError instanceof Error ? availabilityError.message : 'Unknown error',
          },
        ],
        debug: {
          prompt,
          error:
            availabilityError instanceof Error
              ? `${availabilityError.name}: ${availabilityError.message}\n${availabilityError.stack || ''}`
              : String(availabilityError),
          modelStatus: 'error checking availability',
        },
      };
    }

    // Create a session with the language model
    let session;
    try {
      // Get the default parameters first
      const defaults = await LanguageModel.params();
      console.log('Using model parameters:', defaults);

      // Create session with initialPrompts for system context
      session = await LanguageModel.create({
        temperature: 1.0, // Temperature for creative but controlled outputs
        topK: defaults.defaultTopK || 3, // Use default or reasonable fallback
        initialPrompts: [
          {
            role: 'system',
            content: 'You are an expert in analyzing user workflows in web applications.',
          },
        ],
      });
    } catch (sessionError) {
      console.error('Error creating model session:', sessionError);

      return {
        summary: 'Error creating AI model session',
        steps: [
          {
            action: 'Failed to create model session',
            intent: sessionError instanceof Error ? sessionError.message : 'Unknown error',
          },
        ],
        debug: {
          prompt,
          error:
            sessionError instanceof Error
              ? `${sessionError.name}: ${sessionError.message}\n${sessionError.stack || ''}`
              : String(sessionError),
          modelStatus,
        },
      };
    }

    // Send the prompt to the model
    let result;
    try {
      console.log(
        'Sending prompt to model:',
        prompt ? `${prompt.substring(0, 100)}...` : 'undefined prompt',
      );
      result = await session.prompt(prompt);
      console.log('Received response from model:', result);
    } catch (promptError) {
      console.error('Error sending prompt to model:', promptError);

      // Clean up the session
      try {
        session.destroy();
      } catch (e) {
        console.error('Error destroying session after prompt error:', e);
      }

      return {
        summary: 'Error communicating with AI model',
        steps: [
          {
            action: 'Failed to get model response',
            intent: promptError instanceof Error ? promptError.message : 'Unknown error',
          },
        ],
        debug: {
          prompt,
          error:
            promptError instanceof Error
              ? `${promptError.name}: ${promptError.message}\n${promptError.stack || ''}`
              : String(promptError),
          modelStatus,
        },
      };
    }

    // Parse the response as JSON
    try {
      // Check if result exists
      if (!result) {
        console.error('Empty or undefined response from model');

        // Clean up the session if it exists
        if (session) {
          try {
            session.destroy();
          } catch (e) {
            console.error('Error destroying session after empty response:', e);
          }
        }

        return {
          summary: 'Error with model response',
          steps: [
            {
              action: 'Empty response from AI model',
              intent: 'The model returned an empty or undefined response',
            },
          ],
          debug: {
            prompt,
            error: 'Empty or undefined response from model',
            rawResponse: 'undefined',
            modelStatus,
          },
        };
      }

      const analysis = JSON.parse(result) as WorkflowAnalysis;

      // Add debug info to the successful response
      analysis.debug = {
        prompt,
        modelStatus,
        rawResponse: result,
      };

      // Clean up the session when done
      try {
        session.destroy();
      } catch (e) {
        console.error('Error destroying session after successful analysis:', e);
      }

      return analysis;
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      console.log('Raw response:', result || 'undefined');

      // Clean up the session when done
      try {
        if (session) session.destroy();
      } catch (e) {
        console.error('Error destroying session after parse error:', e);
      }

      // Return a default analysis with the error
      return {
        summary: 'Error parsing AI response',
        steps: [
          {
            action: 'Failed to parse model response',
            intent: 'The model response was not valid JSON. Try adjusting the prompt.',
          },
        ],
        debug: {
          prompt,
          error:
            parseError instanceof Error
              ? `${parseError.name}: ${parseError.message}\n${parseError.stack || ''}`
              : String(parseError),
          rawResponse: result || 'undefined or empty response',
          modelStatus,
        },
      };
    }
  } catch (error: unknown) {
    console.error('Error analyzing workflow:', error);

    // Return a default analysis with the error
    return {
      summary: 'Error analyzing workflow',
      steps: [
        {
          action: 'Error in analysis process',
          intent: error instanceof Error ? error.message : 'Unknown error occurred',
        },
      ],
      debug: {
        prompt,
        error:
          error instanceof Error
            ? `${error.name}: ${error.message}\n${error.stack || ''}`
            : String(error),
        modelStatus,
      },
    };
  }
}
