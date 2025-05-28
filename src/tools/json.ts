import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type Anthropic from '@anthropic-ai/sdk';
import type { ClaudeTool, ToolImplementation } from './types';

/**
 * Generic function to convert any Zod schema to JSON Schema
 */
export function createJsonSchema<T extends z.ZodTypeAny>(schema: T): Anthropic.Tool.InputSchema {
  const jsonSchema = zodToJsonSchema(schema, 'schema');
  const schemaDefinition = jsonSchema.definitions?.schema;
  
  if (!schemaDefinition) {
    console.error('Failed to generate JSON schema:', jsonSchema);
    throw new Error('Failed to generate JSON schema for provided schema.');
  }
  
  return schemaDefinition as Anthropic.Tool.InputSchema;
}

/**
 * JSON tool implementation that can be parameterized with any Zod schema
 */
export class JsonTool<T extends z.ZodTypeAny> implements ToolImplementation {
  public readonly name = 'json';
  public readonly description = 'Respond with a JSON object that matches the provided schema.';
  
  constructor(public readonly schema: T) {}
  
  createTool(): ClaudeTool {
    return {
      name: this.name,
      description: this.description,
      input_schema: createJsonSchema(this.schema)
    };
  }
  
  /**
   * Validate a response against this tool's schema
   */
  validateResponse(input: unknown): z.infer<T> {
    const result = this.schema.safeParse(input);
    
    if (!result.success) {
      console.error('JSON tool validation failed:', result.error);
      throw new Error(`Response did not conform to expected schema: ${result.error.message}`);
    }
    
    return result.data;
  }
}

/**
 * Convenience function to create a JSON tool from a Zod schema
 */
export function createJsonTool<T extends z.ZodTypeAny>(schema: T): JsonTool<T> {
  return new JsonTool(schema);
}