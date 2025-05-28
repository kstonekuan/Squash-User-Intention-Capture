import { z } from 'zod';
import type { ClaudeTool, ToolImplementation } from './types';

/**
 * Schema for the think tool
 */
const ThinkSchema = z.object({
  thinking: z.string().describe('Your internal reasoning and thought process'),
});

export type ThinkResponse = z.infer<typeof ThinkSchema>;

/**
 * Think tool implementation that allows Claude to show its reasoning process
 */
export class ThinkTool implements ToolImplementation {
  public readonly name = 'think';
  public readonly description =
    'Use this tool to show your reasoning and thought process before providing a response.';

  createTool(): ClaudeTool {
    return {
      name: this.name,
      description: this.description,
      input_schema: {
        type: 'object',
        properties: {
          thinking: {
            type: 'string',
            description: 'Your internal reasoning and thought process',
          },
        },
        required: ['thinking'],
      },
    };
  }

  /**
   * Validate a response against this tool's schema
   */
  validateResponse(input: unknown): ThinkResponse {
    const result = ThinkSchema.safeParse(input);

    if (!result.success) {
      console.error('Think tool validation failed:', result.error);
      throw new Error(`Response did not conform to expected schema: ${result.error.message}`);
    }

    return result.data;
  }
}

/**
 * Convenience function to create a think tool
 */
export function createThinkTool(): ThinkTool {
  return new ThinkTool();
}
