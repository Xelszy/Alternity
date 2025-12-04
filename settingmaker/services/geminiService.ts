import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Blueprint, AnalysisResult } from '../types';

// Helper to manage the API key selection flow
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
  // Always create a new client to pick up the latest key from the environment
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

const ARCHITECT_SYSTEM_INSTRUCTION = `
You are a High-End K-Drama Set Designer and Luxury Architect.
INPUT: A story snippet.
TASK: Extract unique locations and create HIGH-END, LUXURIOUS visual descriptions for image generation.

RULES FOR "THE WAH FACTOR" (LUXURY UPGRADE):
1. CARS: Always upgrade to "Luxury Sports Car Interior (BMW M4/Mercedes S-Class style)", leather seats, ambient lighting, futuristic dashboard, city bokeh outside.
2. APARTMENTS: Always "Penthouse suite", floor-to-ceiling windows, city skyline view, marble floors, modern Italian furniture.
3. HOSPITALS: "VVIP Suite", looks like a 5-star hotel, spacious, warm lighting, not scary.
4. OFFICES: "CEO Office", top floor, glass walls, expensive mahogany desk.
5. GENERAL: Add keywords: "Cinematic lighting", "8k", "Expensive materials", "Clean aesthetic", "Symmetrical".

You must also analyze the complexity and luxury potential of the scene (0-100).
`;

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    settings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          key: { type: Type.STRING },
          name: { type: Type.STRING },
          prompt: { type: Type.STRING },
          originalContext: { type: Type.STRING },
        },
        required: ["key", "name", "prompt"],
      },
    },
    analysisMetrics: {
      type: Type.OBJECT,
      properties: {
        luxuryScore: { type: Type.NUMBER },
        complexityScore: { type: Type.NUMBER },
        mood: { type: Type.STRING },
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
    contents: `STORY CONTEXT:\n${storyText}`,
    config: {
      systemInstruction: ARCHITECT_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: responseSchema,
      temperature: 0.7, 
    },
  });

  if (response.text) {
    return JSON.parse(response.text) as AnalysisResult;
  }
  throw new Error("Failed to analyze story");
};

export const generateLuxuryImage = async (blueprint: Blueprint): Promise<string> => {
  await ensureApiKey();
  const ai = getClient();

  // MODULE 2: The Factory Logic (Injected Consistency)
  const fullPrompt = `
SCENE: ${blueprint.name}
VISUAL DESCRIPTION: ${blueprint.prompt}

QUALITY & STYLE ENFORCEMENT:
- PHOTOGRAPHY: Wide angle architectural shot, straight lines (no fish-eye distortion).
- LIGHTING: Cinematic depth, soft shadows, expensive ambiance, golden hour or cinematic night.
- COMPOSITION: Empty room (NO PEOPLE), Rule of thirds, Balanced.
- ORIENTATION: Portrait.

NEGATIVE PROMPT (AVOID):
- People, characters, messy, dirty, broken, low resolution, blurry, distorted perspective, surreal, cartoon, anime style, text, watermark.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: "1K", // Can upgrade to 2K/4K if needed
        },
      },
    });

    // Extract image
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    
    throw new Error("No image data returned");
  } catch (error) {
    console.error("Image gen error:", error);
    throw error;
  }
};
