/**
 * Conversational AI Photo Editor — Type Definitions
 * Mendefinisikan model data untuk percakapan, instruksi terstruktur, dan provider adapter.
 */

import type { PhotoEditState } from './types';

export type OperationTarget =
  | 'adjustments'
  | 'filter'
  | 'geometry'
  | 'ai_copier'
  | 'reconstruction'
  | 'history'
  | 'generative'
  | 'clarification';

export type OperationStatus =
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'clarification_needed'
  | 'reverted';

export interface StructuredOperation {
  id: string;
  userPrompt: string;
  target: OperationTarget;
  action: string;
  parameters: Record<string, number | string | boolean>;
  confidence: number; // 0.0 - 1.0
  provider: 'local' | 'remote';
  status: OperationStatus;
  explanation: string;
  clarificationPrompt?: string;
  diffSummary?: string[];
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string;
  operation?: StructuredOperation;
  appliedChangesSummary?: string[];
  suggestedFollowUps?: string[];
  isProcessing?: boolean;
  error?: string;
  isGenerativeConsent?: boolean;
  resultImage?: string;
}

export interface OperationProgress {
  stage: string;
  percent: number;
}

export interface EditSessionContext {
  currentState: PhotoEditState;
  previousOperations: StructuredOperation[];
  lastAdjustmentAction?: string;
  lastAdjustmentParams?: Record<string, number>;
  sourceFileName: string;
  imageDimensions: { width: number; height: number };
  sourceImageBase64?: string;
  sourceCanvas?: HTMLCanvasElement | null;
  abortSignal?: AbortSignal;
  onProgress?: (progress: OperationProgress) => void;
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  type: 'local' | 'remote';
  isAvailable(): boolean;
  executeOperation(
    operation: StructuredOperation,
    context: EditSessionContext
  ): Promise<{
    nextState: PhotoEditState;
    summary: string[];
    resultImage?: string;
    errorCode?: string;
  }>;
}

