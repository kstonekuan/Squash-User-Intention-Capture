import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { RawEvent, WorkflowAnalysis } from './types';

// Zod schema for workflow analysis
const WorkflowAnalysisSchema = z.object({
  summary: z.string().describe('Brief description of the overall workflow purpose - generalizable to similar workflows'),
  steps: z.array(
    z.object({
      action: z.string().describe('What the user did'),
      intent: z.string().describe('Why they did it / what they were trying to accomplish')
    })
  ).describe('Step-by-step breakdown of the workflow'),
  suggestions: z.array(
    z.string().describe('Suggestions for optimization, what to look out for, or potential pitfalls')
  ).describe('Suggestions for executing or optimizing this workflow')
});

// Convert Zod schema to JSON Schema following best practices
function getWorkflowAnalysisJsonSchema(): Anthropic.Tool.InputSchema {
  const jsonSchema = zodToJsonSchema(WorkflowAnalysisSchema, 'schema');
  const schemaDefinition = jsonSchema.definitions?.schema;
  
  if (!schemaDefinition) {
    console.error('Failed to generate JSON schema:', jsonSchema);
    throw new Error('Failed to generate JSON schema for WorkflowAnalysisSchema.');
  }
  
  return schemaDefinition as Anthropic.Tool.InputSchema;
}

// Default Claude model
const CLAUDE_MODEL = 'claude-opus-4-20250514';

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

    // Try a simple prompt - for testing, we'll create a minimal prompt
    const testPrompt = 'Analyze this simple test workflow: User opens a webpage.';
    const result = await callClaudeAPI(testPrompt, apiKey);

    if (!result) {
      testResult.error = 'Received empty response from Claude API';
    } else {
      testResult.success = true;
      testResult.response = `Test successful - received structured response: ${result.summary}`;
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
You are an expert in analyzing user workflows in web applications. I'll provide you with a sequence of user interactions, and I need you to analyze the workflow.

1. Identify the overall goal/purpose of this workflow - it should be generalizable to similar workflows.
2. For each significant action, explain what the user was trying to accomplish
3. Provide suggestions on what someone should look out for when executing this workflow, how to optimize it, or any potential pitfalls.

Here is the workflow sequence:

${formattedEvents}

Use the analyze_workflow tool to provide your structured analysis.
`;
}

/**
 * Call the Claude API with a prompt using the Anthropic SDK with tools
 * @param prompt The prompt to send to Claude
 * @param apiKey The API key to use
 * @returns Promise that resolves to the structured WorkflowAnalysis
 */
async function callClaudeAPI(prompt: string, apiKey: string): Promise<WorkflowAnalysis> {
  try {
    const anthropic = new Anthropic({
      apiKey,
      // Required for browser usage
      dangerouslyAllowBrowser: true,
    });

    const message = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
      tools: [
        {
          name: 'analyze_workflow',
          description: 'Analyze a user workflow and provide structured insights',
          input_schema: getWorkflowAnalysisJsonSchema()
        }
      ],
      tool_choice: { type: 'tool', name: 'analyze_workflow' }
    });

    // Extract tool use from the response
    const toolUse = message.content.find(block => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('No tool use in Claude response');
    }

    // Validate the response using Zod with proper error handling
    const result = WorkflowAnalysisSchema.safeParse(toolUse.input);
    
    if (!result.success) {
      console.error('Schema validation failed:', result.error);
      throw new Error(`Response did not conform to expected schema: ${result.error.message}`);
    }
    
    return result.data;
  } catch (error) {
    console.error('Error calling Claude API:', error);
    
    // Handle Zod validation errors
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid response structure: ${error.message}`);
    }
    
    // Handle specific Anthropic SDK errors
    if (error instanceof Anthropic.APIError) {
      throw new Error(`Anthropic API error: ${error.status} - ${error.message}`);
    }
    
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error('Invalid API key. Please check your Anthropic API key.');
    }
    
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    if (error instanceof Anthropic.BadRequestError) {
      throw new Error(`Bad request: ${error.message}`);
    }
    
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
      console.log('Received structured response from Claude API:', result.summary);

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

      // Add debug info to the successful response
      const analysis: WorkflowAnalysis = {
        ...result,
        debug: {
          prompt,
          modelStatus: 'available',
          rawResponse: JSON.stringify(result),
        },
      };

      return analysis;
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
