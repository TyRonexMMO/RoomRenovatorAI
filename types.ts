
export enum RenovationStage {
  ORIGINAL = 'ORIGINAL',
  DEMOLITION = 'DEMOLITION',
  WALL_PREP = 'WALL_PREP',
  FLOORING_PAINT = 'FLOORING_PAINT',
  FINAL_DECOR = 'FINAL_DECOR'
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  images?: {
    url: string;
    stage: RenovationStage;
    label: string;
  }[];
  structuredPrompts?: {
    stage: string;
    text: string;
  }[];
  videoUrls?: string[];
  isProcessing?: boolean;
  videoStatus?: string;
}

export interface GenerationState {
  isGenerating: boolean;
  currentStage: number;
  statusText: string;
}
