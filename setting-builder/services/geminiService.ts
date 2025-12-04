import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Blueprint, AnalysisResult } from '../types';

export const ensureApiKey = async (): Promise<void> => {
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await win.aistudio.openSelectKey();
    }
  }
};

const getClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// MODIFIED: Strict instruction to look for [insert image] tags and produce Film Quality output.
const ARCHITECT_SYSTEM_INSTRUCTION = `
You are a Hollywood Production Designer and Director of Photography.
INPUT: A story manuscript (text).
TASK: 
1. Scan the text for the specific tag: "[insert image]".
2. IMPORTANT: If text immediately follows the tag (e.g., "[insert image] a dark castle"), USE THAT TEXT as the base for the visual.
3. If no description follows (just the tag), read the surrounding context to create the scene.
4. Generate a PHOTOREALISTIC, CINEMATIC prompt for that specific moment.
5. If NO tags are found at all, automatically select the 3 most visually striking locations in the text as a fallback.

PROMPT QUALITY RULES (FILM LOOK):
- STYLE: Shot on Arri Alexa 65, 70mm IMAX, Anamorphic Lens.
- LIGHTING: Volumetric lighting, Rembrant lighting, Cinematic Color Grading (Teal & Orange or Mood-appropriate).
- DETAIL: 8k resolution, highly detailed texture, grain (subtle), depth of field.
- COMPOSITION: Rule of thirds, wide cinematic shot.

OUTPUT FORMAT (JSON):
Return a list of settings found.
`;

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    settings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING, description: "short_snake_case_id" },
          name: { type: Type.STRING, description: "Display Name" },
          prompt: { type: Type.STRING, description: "The highly detailed cinematic prompt" },
          originalContext: { type: Type.STRING, description: "The snippet of text that triggered this" },
        },
        required: ["key", "name", "prompt"],
      },
    },
  },
  required: ["settings"],
};

export const analyzeStory = async (storyText: string): Promise<AnalysisResult> => {
  await ensureApiKey();
  const ai = getClient();

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `MANUSCRIPT CONTENT:\n${storyText}`,
    config: {
      systemInstruction: ARCHITECT_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.5, 
    },
  });

  if (response.text) {
    return JSON.parse(response.text) as AnalysisResult;
  }
  throw new Error("Failed to analyze story");
};