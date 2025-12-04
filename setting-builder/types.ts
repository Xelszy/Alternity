
export interface Blueprint {
  key: string;
  name: string;
  prompt: string;
  originalContext?: string;
}

export interface AnalysisResult {
  settings: Blueprint[];
}

export enum AppStep {
  INPUT = 'INPUT',
  ARCHITECT = 'ARCHITECT',
  SCRIPT = 'SCRIPT',
}
