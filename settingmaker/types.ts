
export interface Blueprint {
  key: string;
  name: string;
  prompt: string;
  originalContext?: string;
}

export interface AnalysisResult {
  settings: Blueprint[];
  analysisMetrics?: {
    luxuryScore: number;
    complexityScore: number;
    mood: string;
  };
}

export enum AppStep {
  INPUT = 'INPUT',
  ARCHITECT = 'ARCHITECT',
  SCRIPT = 'SCRIPT',
}

export interface GenerationConfig {
  aspectRatio: '1:1' | '3:4' | '4:3' | '16:9' | '9:16';
  resolution: '1K' | '2K' | '4K';
}
