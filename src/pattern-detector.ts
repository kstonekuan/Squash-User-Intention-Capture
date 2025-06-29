import { z } from 'zod';
import { isAIModelAvailable } from './ai';
import {
  callClaudeWithSchema,
  getApiKey,
  isRemoteAIConfigured,
  isRemoteAIEnabled,
} from './remote-ai';
import type { RawEvent } from './types';

// Zod schema for pattern detection response
const PatternDetectionSchema = z.object({
  patterns: z.array(
    z.object({
      description: z.string().describe('What the user is trying to accomplish'),
      occurrences: z
        .array(
          z.object({
            start: z.number().describe('Start index in the event array'),
            end: z.number().describe('End index in the event array'),
          }),
        )
        .describe('Array of occurrences of this pattern'),
      confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
    }),
  ),
});

type PatternDetectionResponse = z.infer<typeof PatternDetectionSchema>;

export interface DetectedPattern {
  sequence: RawEvent[];
  occurrences: number;
  confidence: number;
  firstSeen: number;
  lastSeen: number;
  averageDuration: number;
  description?: string; // Added: LLM's description of the pattern
}

export interface PatternDetectorConfig {
  windowSizeMs: number; // How far back to look (default: 1 hour)
  minSequenceLength: number; // Minimum actions in a pattern (default: 3)
  maxSequenceLength: number; // Maximum actions in a pattern (default: 20)
  minUserActionRatio: number; // Minimum ratio of user actions (default: 0.5)
}

export class PatternDetector {
  private config: PatternDetectorConfig;

  constructor(config: Partial<PatternDetectorConfig> = {}) {
    this.config = {
      windowSizeMs: 3600000, // 1 hour
      minSequenceLength: 3,
      maxSequenceLength: 20,
      minUserActionRatio: 0.5,
      ...config,
    };
  }

  /**
   * Detect repetitive patterns in the event stream using LLM
   */
  async detectPatterns(events: RawEvent[]): Promise<DetectedPattern[]> {
    // Filter events to the time window
    const now = Date.now();
    const windowStart = now - this.config.windowSizeMs;
    const recentEvents = events.filter(e => e.t >= windowStart);

    // Early exit if not enough events
    if (recentEvents.length < this.config.minSequenceLength * 2) {
      return [];
    }

    // Pre-filter events to reduce noise before sending to LLM
    const filteredEvents = this.preFilterEvents(recentEvents);

    if (filteredEvents.length < this.config.minSequenceLength * 2) {
      return [];
    }

    // Use LLM to detect patterns
    return await this.detectPatternsWithLLM(filteredEvents);
  }

  /**
   * Pre-filter events to reduce noise before LLM analysis
   */
  private preFilterEvents(events: RawEvent[]): RawEvent[] {
    return events.filter(_event => {
      // TODO: Decide on what to filter out
      return true;
    });
  }

  /**
   * Use LLM to detect patterns in the event stream
   */
  private async detectPatternsWithLLM(events: RawEvent[]): Promise<DetectedPattern[]> {
    try {
      // Check which AI to use
      const useRemoteAI = await isRemoteAIEnabled();

      if (useRemoteAI) {
        const configured = await isRemoteAIConfigured();
        if (!configured) {
          console.error('Remote AI not configured for pattern detection');
          return [];
        }
        return await this.detectWithRemoteAI(events);
      }
      const available = await isAIModelAvailable();
      if (!available) {
        console.error('Chrome AI not available for pattern detection');
        return [];
      }
      return await this.detectWithLocalAI(events);
    } catch (error) {
      console.error('Error in LLM pattern detection:', error);
      return [];
    }
  }

  /**
   * Detect patterns using Chrome's built-in AI
   */
  private async detectWithLocalAI(events: RawEvent[]): Promise<DetectedPattern[]> {
    try {
      const session = await LanguageModel.create({
        temperature: 0.3, // Lower temperature for more consistent pattern detection
        topK: 3,
      });

      const prompt = this.createPatternDetectionPrompt(events);
      const response = await session.prompt(prompt);

      session.destroy();

      return this.parsePatternResponse(response, events);
    } catch (error) {
      console.error('Error with local AI pattern detection:', error);
      return [];
    }
  }

  /**
   * Detect patterns using remote AI (Claude)
   */
  private async detectWithRemoteAI(events: RawEvent[]): Promise<DetectedPattern[]> {
    try {
      const prompt = this.createPatternDetectionPrompt(events);
      const apiKey = getApiKey();

      // Use structured output with Zod schema
      const response = await callClaudeWithSchema(prompt, PatternDetectionSchema, apiKey);

      // Convert structured response to DetectedPattern format
      return this.convertStructuredResponse(response, events);
    } catch (error) {
      console.error('Error with remote AI pattern detection:', error);
      return [];
    }
  }

  /**
   * Create a prompt for the LLM to detect patterns
   */
  private createPatternDetectionPrompt(events: RawEvent[]): string {
    const formattedEvents = this.formatEventsForPrompt(events);

    return `Analyze the following sequence of user actions and identify any repetitive patterns or workflows that appear multiple times. Focus on meaningful user tasks, not just random clicks.

Events (newest first):
${formattedEvents}

Identify patterns where the user performs similar sequences of actions multiple times. For each pattern found, provide:
1. A description of what the user is trying to accomplish
2. The start and end indices of each occurrence of the pattern
3. A confidence score (0-1) based on how similar the occurrences are

Only identify patterns that:
- Occur at least 2 times
- Have at least 3 meaningful actions
- Represent a complete user task or workflow
- Are not just random navigation

If no clear repetitive patterns are found, return an empty patterns array.`;
  }

  /**
   * Format events for the prompt
   */
  private formatEventsForPrompt(events: RawEvent[]): string {
    return events
      .map((event, index) => {
        const event_string = JSON.stringify(event);
        return `[${index}] ${event_string}`;
      })
      .join('\n');
  }

  /**
   * Convert structured response to DetectedPattern format
   */
  private convertStructuredResponse(
    response: PatternDetectionResponse,
    events: RawEvent[],
  ): DetectedPattern[] {
    return response.patterns
      .filter(p => p.occurrences && p.occurrences.length >= 2)
      .map(pattern => this.createDetectedPattern(pattern, events))
      .filter(
        (p): p is DetectedPattern =>
          p !== null && p.sequence.length >= this.config.minSequenceLength,
      )
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5); // Return top 5 patterns
  }

  /**
   * Create a DetectedPattern from a pattern in the structured response
   */
  private createDetectedPattern(
    pattern: {
      description: string;
      occurrences: Array<{ start: number; end: number }>;
      confidence: number;
    },
    events: RawEvent[],
  ): DetectedPattern | null {
    try {
      // Get all the sequences for this pattern
      const sequences = pattern.occurrences.map(occ => events.slice(occ.start, occ.end + 1));

      // Validate sequences
      if (sequences.length === 0 || sequences[0].length === 0) {
        return null;
      }

      // Use the first sequence as representative
      const representativeSequence = sequences[0];

      // Calculate metrics
      const timestamps = sequences.map(seq => ({
        start: seq[0].t,
        end: seq[seq.length - 1].t,
      }));

      const durations = timestamps.map(ts => ts.end - ts.start);
      const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;

      return {
        sequence: representativeSequence,
        occurrences: pattern.occurrences.length,
        confidence: pattern.confidence,
        description: pattern.description,
        firstSeen: Math.min(...timestamps.map(ts => ts.start)),
        lastSeen: Math.max(...timestamps.map(ts => ts.end)),
        averageDuration,
      };
    } catch (error) {
      console.error('Error creating detected pattern:', error);
      return null;
    }
  }

  /**
   * Parse the LLM response and convert to DetectedPattern objects
   */
  private parsePatternResponse(response: string, events: RawEvent[]): DetectedPattern[] {
    try {
      const parsed = JSON.parse(response) as PatternDetectionResponse;
      if (!parsed.patterns || !Array.isArray(parsed.patterns)) {
        return [];
      }

      return parsed.patterns
        .filter(p => p.occurrences && p.occurrences.length >= 2)
        .map(pattern => {
          // Get all the sequences for this pattern
          const sequences = pattern.occurrences.map((occ: { start: number; end: number }) =>
            events.slice(occ.start, occ.end + 1),
          );

          // Use the first sequence as representative
          const representativeSequence = sequences[0];

          // Calculate metrics
          const timestamps = sequences.map((seq: RawEvent[]) => ({
            start: seq[0].t,
            end: seq[seq.length - 1].t,
          }));

          const durations = timestamps.map(
            (ts: { start: number; end: number }) => ts.end - ts.start,
          );
          const averageDuration =
            durations.reduce((sum: number, d: number) => sum + d, 0) / durations.length;

          return {
            sequence: representativeSequence,
            occurrences: pattern.occurrences.length,
            confidence: pattern.confidence || 0.75,
            description: pattern.description,
            firstSeen: Math.min(
              ...timestamps.map((ts: { start: number; end: number }) => ts.start),
            ),
            lastSeen: Math.max(...timestamps.map((ts: { start: number; end: number }) => ts.end)),
            averageDuration,
          };
        })
        .filter((p: DetectedPattern) => p.sequence.length >= this.config.minSequenceLength)
        .sort((a: DetectedPattern, b: DetectedPattern) => b.confidence - a.confidence)
        .slice(0, 5); // Return top 5 patterns
    } catch (error) {
      console.error('Error parsing pattern response:', error);
      return [];
    }
  }
}

/**
 * Simple pattern detector for MVP
 */
export async function detectRepetitivePattern(events: RawEvent[]): Promise<DetectedPattern | null> {
  const detector = new PatternDetector();
  const patterns = await detector.detectPatterns(events);
  return patterns.length > 0 ? patterns[0] : null;
}
