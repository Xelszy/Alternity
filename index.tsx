import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import { 
  Bot, 
  Code, 
  Download, 
  FileJson, 
  Sparkles, 
  Terminal, 
  ChevronRight, 
  Loader2, 
  Image as ImageIcon,
  AlertCircle
} from "lucide-react";

// --- CONFIGURATION ---

const SYSTEM_INSTRUCTION = `
You are a Data Structuring AI.
ROLE: Convert raw character descriptions into a strict JSON format.
RULES:
1. Translate ALL descriptions (values) to English.
2. FORCE ETHNICITY: If ethnicity is not specified or vague, set it to "Korean" or "Chinese" to fit a K-Drama aesthetic.
3. VISUALS: Make descriptions photorealistic (add 'realistic texture', 'detailed').
4. OUTFITS (CRITICAL): You must extract ALL outfits listed in the text.
   - KEYS (Indonesian): Use the specific category name in Indonesian as the key. E.g., "Baju santai" -> key: "santai". "Baju pasien" -> key: "pasien". "Baju tidur" -> key: "tidur". If it is "Baju default", use "default".
   - VALUES (English): Translate the visual description of the clothes to English.
   - ENRICHMENT (ACCESSORIES): For EVERY outfit, you MUST append suitable high-end or character-appropriate accessories if not explicitly stated. 
     Infer these based on the character's Gender, Age, and Status.
     Examples:
     - Business/Rich Male: Add "Rolex Submariner watch", "Gold cufflinks".
     - Casual/Rugged Male: Add "Seiko Prospex PADI Turtle watch", "Leather bracelet".
     - Elegant Female: Add "Diamond stud earrings", "Cartier Love bracelet", "Pearl necklace".
     - Young/Hip: Add "Silver rings", "Smart watch".
     Make the description extremely detailed including these accessories.
5. OUTPUT: Return ONLY valid JSON string. No markdown formatting.

JSON STRUCTURE TARGET:
{
  "UniqueName": {
    "name": "Name",
    "stats": {"age": "...", "ethnicity": "Korean/Chinese..."},
    "visuals": {
        "face": "...",
        "hair": "Color, Style, Length"
    },
    "outfits": {
        "default": "...",
        "santai": "...",
        "formal": "...",
        "pasien": "...", 
        // Capture ANY other outfits found!
    }
  }
}
`;

const DEFAULT_INPUT = `MC
Wanita mid 20s
Rambut hitam lurus tanpa poni panjang sebahu
Pale skin
Baju default: Midi dress cream, knitted cardigan sage green
Baju santai: Short sleeved black home dress
Baju pasien: piyama rumah sakit warna biru muda

Juan
Pria mid 30s
Rambut hitam, under cut and slicked back
Wajah tegas, alis lurus, rahang tegas
Baju default: kemeja slim fit putih, ankle pants navy
Baju formal: stelan jas warna navy dengan aksen silver
Baju casual: polo shirt hitam, ankle pants cream, black leather jacket`;

// --- PYTHON SCRIPT TEMPLATE ---
// This function constructs the python script content by injecting the JSON data
const generatePythonScript = (jsonData: any) => {
  const jsonString = JSON.stringify(jsonData, null, 4);
  
  // We use double curly braces {{ }} to escape them in the f-string equivalent
  return `import os
import time
from pathlib import Path
from google import genai
from google.genai import types
from PIL import Image
from getpass import getpass

# === INJECTED DATA FROM MODULE 2 ===
CHARACTERS = ${jsonString}
# ===================================

print("🎬 SWEET REVENGE - REFERENCE GENERATOR")
print(f"Loaded {len(CHARACTERS)} characters from database.")

api_key = input("Paste Gemini API Key (or press Enter if set in env): ")
if not api_key:
    api_key = os.environ.get("GOOGLE_API_KEY")

client = genai.Client(api_key=api_key)
MODEL = "gemini-3-pro-image-preview"

def crop_4_5(path):
    try:
        img = Image.open(path)
        w, h = img.size
        target = 4/5
        if abs(w/h - target) > 0.05:
            new_w = int(h * target)
            left = (w - new_w)//2
            img = img.crop((left, 0, left+new_w, h))
            img.save(path)
    except: pass

def generate(prompt, path, refs=None):
    path = Path(path)
    if path.exists(): return
    path.parent.mkdir(parents=True, exist_ok=True)
    
    contents = [prompt]
    if refs:
        for r in refs:
            if r.exists():
                contents.append(Image.open(r))
                contents.append("REFERENCE: Keep face/hair EXACTLY like this.")

    print(f"   Generating: {path.name}...")
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                temperature=0.3,
                image_config=types.ImageConfig(aspect_ratio="4:5")
            )
        )
        if response.candidates and response.candidates[0].content.parts:
            # Handle potential multiple parts or finding the right image part
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                     with open(path, "wb") as f:
                        f.write(part.inline_data.data)
                     crop_4_5(path)
                     break
    except Exception as e:
        print(f"   Error: {e}")

# === WORKFLOW ENGINE ===
for name, data in CHARACTERS.items():
    print(f"\\n👤 {name.upper()}")
    base_dir = Path(f"references/{name}")
    
    # 1. Headshots (Progressive)
    hs_prompts = {
        "front": f"ID PHOTO, Front view, {data['stats']['ethnicity']}, {data['stats']['age']}. Face: {data['visuals']['face']}. Hair: {data['visuals']['hair']}. Photorealistic, 8k, neutral background.",
        "side": f"Side profile view, {data['stats']['ethnicity']}. Same person. Face: {data['visuals']['face']}. Hair: {data['visuals']['hair']}."
    }
    
    f_path = base_dir / "headshot_front.png"
    s_path = base_dir / "headshot_side.png"
    
    generate(hs_prompts["front"], f_path)
    generate(hs_prompts["side"], s_path, refs=[f_path])
    
    # 2. Outfits
    refs = [p for p in [f_path, s_path] if p.exists()]
    
    for outfit_name, outfit_desc in data['outfits'].items():
        print(f"   👗 Outfit: {outfit_name}")
        # Clean filename
        safe_name = outfit_name.replace(" ", "_").lower()
        prompt = f"Full body shot, {data['stats']['ethnicity']}. Wearing {outfit_desc}. Hair: {data['visuals']['hair']}. Studio lighting."
        generate(prompt, base_dir / f"outfit_{safe_name}.png", refs=refs)

print("\\n✅ DONE! Check references folder.")
`;
};

// --- COMPONENTS ---

const App = () => {
  // State
  const [rawInput, setRawInput] = useState(DEFAULT_INPUT);
  const [isProcessing, setIsProcessing] = useState(false);
  const [jsonResult, setJsonResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"input" | "json" | "preview">("input");
  
  // Preview State
  const [previewChar, setPreviewChar] = useState<string>("");
  const [previewGenerating, setPreviewGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Initialize API
  const apiKey = process.env.API_KEY;

  const handleNormalize = async () => {
    if (!apiKey) {
      setError("API Key not found in environment.");
      return;
    }
    setIsProcessing(true);
    setError(null);
    setJsonResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `RAW INPUT:\n${rawInput}`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
        },
      });

      const text = response.text;
      if (text) {
        const parsed = JSON.parse(text);
        setJsonResult(parsed);
        setActiveTab("json");
        // Select first char for preview default
        if (Object.keys(parsed).length > 0) {
          setPreviewChar(Object.keys(parsed)[0]);
        }
      } else {
        throw new Error("Empty response from AI");
      }
    } catch (err: any) {
      setError(err.message || "Failed to process data.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!jsonResult) return;
    const scriptContent = generatePythonScript(jsonResult);
    const blob = new Blob([scriptContent], { type: "text/x-python" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "run_generator.py";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleGeneratePreview = async () => {
    if (!previewChar || !jsonResult || !jsonResult[previewChar]) return;
    
    setPreviewGenerating(true);
    setError(null);
    setPreviewImage(null);

    const charData = jsonResult[previewChar];
    // Construct prompt similar to the python script
    const prompt = `ID PHOTO, Front view, ${charData.stats.ethnicity}, ${charData.stats.age}. Face: ${charData.visuals.face}. Hair: ${charData.visuals.hair}. Photorealistic, 8k, neutral background.`;

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      // Using gemini-3-pro-image-preview for high quality preview as per design doc standards
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: {
          parts: [{ text: prompt }]
        },
        config: {
          imageConfig: {
            aspectRatio: "4:5", // Match python script default
          }
        }
      });

      // Extract image
      let foundImage = false;
      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
           if (part.inlineData) {
             const base64 = part.inlineData.data;
             const mimeType = part.inlineData.mimeType || "image/png";
             setPreviewImage(`data:${mimeType};base64,${base64}`);
             foundImage = true;
             break;
           }
        }
      }
      
      if (!foundImage) {
        setError("No image data returned from API.");
      }

    } catch (err: any) {
      setError(err.message || "Failed to generate preview image.");
    } finally {
      setPreviewGenerating(false);
    }
  };

  return (
    <div className="min-h-screen font-sans text-slate-300 selection:bg-indigo-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-indigo-500 flex items-center justify-center text-white font-bold">
              <Bot size={20} />
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Character Forge <span className="text-indigo-400">AI</span></h1>
          </div>
          <div className="flex gap-4 text-sm font-medium">
             <div className="flex items-center gap-2 px-3 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                <Terminal size={14} />
                <span>v1.0.3 (Accessories+)</span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Workflow Tabs */}
        <div className="flex items-center gap-8 border-b border-slate-800 mb-8">
          <button 
            onClick={() => setActiveTab("input")}
            className={`pb-4 text-sm font-medium transition-colors relative ${activeTab === "input" ? "text-indigo-400" : "text-slate-500 hover:text-slate-300"}`}
          >
            1. Raw Input
            {activeTab === "input" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
          </button>
          
          <button 
            onClick={() => jsonResult && setActiveTab("json")}
            disabled={!jsonResult}
            className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${activeTab === "json" ? "text-indigo-400" : jsonResult ? "text-slate-500 hover:text-slate-300" : "text-slate-700 cursor-not-allowed"}`}
          >
            2. Structured Data
            {jsonResult && <span className="w-2 h-2 rounded-full bg-green-500" />}
            {activeTab === "json" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
          </button>

          <button 
            onClick={() => jsonResult && setActiveTab("preview")}
            disabled={!jsonResult}
            className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${activeTab === "preview" ? "text-indigo-400" : jsonResult ? "text-slate-500 hover:text-slate-300" : "text-slate-700 cursor-not-allowed"}`}
          >
            3. Live Preview & Export
            {activeTab === "preview" && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/50 text-red-200 flex items-start gap-3">
            <AlertCircle className="mt-0.5 shrink-0" size={18} />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* --- VIEW 1: RAW INPUT --- */}
        {activeTab === "input" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-400">Raw Character Description</label>
                <span className="text-xs text-slate-500">Supports Indonesian, unformatted text</span>
              </div>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="w-full h-[500px] bg-slate-900 border border-slate-700 rounded-xl p-6 font-mono text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 resize-none custom-scrollbar shadow-inner"
                placeholder="Paste your raw character data here..."
              />
            </div>
            
            <div className="space-y-6">
              <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 space-y-4">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-yellow-500" />
                  Module 1: Normalizer
                </h3>
                <p className="text-sm text-slate-400 leading-relaxed">
                  This process uses <strong>Gemini 2.5 Flash</strong> to parse your raw text into a standard JSON structure. 
                </p>
                <ul className="text-sm text-slate-500 space-y-2 list-disc pl-4">
                  <li>Translates values to English</li>
                  <li>Forces Chinese/Korean Ethnicity</li>
                  <li>Enhances visual details</li>
                  <li><strong>Auto-Adds Accessories (Rolex, Seiko, etc.)</strong></li>
                  <li><strong>Preserves Indo Keys (e.g. "santai")</strong></li>
                </ul>
                <button
                  onClick={handleNormalize}
                  disabled={isProcessing}
                  className={`w-full py-3 px-4 rounded-lg font-medium text-white flex items-center justify-center gap-2 transition-all ${isProcessing ? "bg-slate-700 cursor-wait" : "bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20"}`}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileJson size={18} />
                      Normalize Data
                    </>
                  )}
                </button>
              </div>

              <div className="p-4 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-center space-y-2 text-slate-500">
                <p className="text-xs uppercase tracking-wider font-semibold">IPO Status</p>
                <div className="flex items-center gap-2 text-sm">
                   <span className={isProcessing ? "text-yellow-500" : "text-slate-400"}>Input</span>
                   <ChevronRight size={14} />
                   <span className={jsonResult ? "text-green-500" : "text-slate-600"}>Process</span>
                   <ChevronRight size={14} />
                   <span className="text-slate-600">Output</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- VIEW 2: JSON EDITOR --- */}
        {activeTab === "json" && jsonResult && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="lg:col-span-2 space-y-4">
               <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-400">characters.json</label>
                  <div className="text-xs text-green-400 flex items-center gap-1">
                    <Sparkles size={12} />
                    Auto-Formatted
                  </div>
               </div>
               <div className="relative group">
                 <textarea
                   value={JSON.stringify(jsonResult, null, 4)}
                   onChange={(e) => {
                     try {
                        setJsonResult(JSON.parse(e.target.value));
                        setError(null);
                     } catch(err) {
                        // Just let them type, valid JSON will parse on render or next action
                     }
                   }}
                   className="w-full h-[600px] bg-slate-950 border border-slate-800 rounded-xl p-6 font-mono text-sm text-green-400 focus:outline-none focus:ring-2 focus:ring-green-900 focus:border-green-700 resize-none custom-scrollbar shadow-inner"
                 />
                 <div className="absolute top-4 right-4 text-xs bg-slate-900 text-slate-500 px-2 py-1 rounded border border-slate-800 pointer-events-none">
                    Editable
                 </div>
               </div>
             </div>

             <div className="space-y-6">
                <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 space-y-4">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Code size={16} className="text-blue-400" />
                    Module 2: Factory
                  </h3>
                  <p className="text-sm text-slate-400">
                    Your data is ready. You can now generate the Python script which includes:
                  </p>
                  <ul className="text-sm text-slate-500 space-y-2">
                     <li className="flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                       Embedded JSON Data
                     </li>
                     <li className="flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                       Gemini 3 Pro Image Logic
                     </li>
                     <li className="flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                       Automatic Cropping (4:5)
                     </li>
                  </ul>
                  
                  <div className="pt-4 border-t border-slate-700/50">
                    <button
                      onClick={handleDownload}
                      className="w-full py-3 px-4 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2 transition-all"
                    >
                      <Download size={18} />
                      Download run_generator.py
                    </button>
                  </div>
                </div>
                
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                  <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Detected Characters</h4>
                  <div className="space-y-2">
                    {Object.keys(jsonResult).map(name => (
                      <div key={name} className="flex items-center justify-between p-2 rounded bg-slate-800/50 border border-slate-700/50">
                        <span className="text-sm font-medium text-white">{name}</span>
                        <span className="text-xs text-slate-500">{Object.keys(jsonResult[name].outfits).length} outfits</span>
                      </div>
                    ))}
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* --- VIEW 3: PREVIEW --- */}
        {activeTab === "preview" && jsonResult && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-2">
              <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden min-h-[500px] flex items-center justify-center relative">
                 {previewImage ? (
                   <img src={previewImage} alt="Preview" className="max-h-[600px] object-contain" />
                 ) : (
                   <div className="text-center p-8">
                     <ImageIcon size={48} className="mx-auto text-slate-800 mb-4" />
                     <p className="text-slate-600">Select a character and click generate to test the visual prompts.</p>
                   </div>
                 )}
                 
                 {previewGenerating && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center flex-col gap-3">
                       <Loader2 className="animate-spin text-indigo-500" size={32} />
                       <span className="text-sm font-medium text-indigo-300">Generating preview...</span>
                    </div>
                 )}
              </div>
            </div>

            <div className="space-y-6">
               <div className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 space-y-4">
                  <h3 className="font-semibold text-white">Live Test</h3>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 uppercase">Target Character</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.keys(jsonResult).map(name => (
                        <button
                          key={name}
                          onClick={() => setPreviewChar(name)}
                          className={`px-3 py-2 rounded text-sm font-medium transition-all border ${previewChar === name ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"}`}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-4 text-xs text-slate-500">
                    <p>Testing prompt for <strong>Headshot (Front)</strong>.</p>
                    <p className="mt-1 opacity-75">This uses <code>gemini-3-pro-image-preview</code> to match the final script's output.</p>
                  </div>

                  <button
                    onClick={handleGeneratePreview}
                    disabled={previewGenerating}
                    className="w-full py-3 px-4 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all"
                  >
                    <Sparkles size={18} />
                    Generate Preview
                  </button>
               </div>

               <div className="p-6 rounded-xl bg-slate-900 border border-slate-800">
                 <h4 className="text-sm font-semibold text-white mb-2">Ready to ship?</h4>
                 <p className="text-sm text-slate-400 mb-4">
                   Once you are happy with the JSON data, download the Python script to run the full batch generation on your local machine.
                 </p>
                 <button
                    onClick={handleDownload}
                    className="w-full py-2 px-4 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-sm flex items-center justify-center gap-2"
                  >
                    <Download size={14} />
                    Download Script
                  </button>
               </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);