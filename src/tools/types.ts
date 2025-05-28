import type Anthropic from '@anthropic-ai/sdk';

/**
 * Tool definition for Claude API calls
 */
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
}

/**
 * Base interface for tool implementations
 */
export interface ToolImplementation {
  name: string;
  description: string;
  createTool(): ClaudeTool;
}