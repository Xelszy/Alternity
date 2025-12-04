import React, { useState, useRef } from 'react';
import { AppStep, Blueprint } from './types';
import { analyzeStory } from './services/geminiService';
import StepIndicator from './components/StepIndicator';
import { Download, Zap, Upload, FileText, X, Code, Copy, Check, RotateCcw } from 'lucide-react';
import mammoth from 'mammoth';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [story, setStory] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [copied, setCopied] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAnalyze = async () => {
    if (!story.trim()) return;
    setIsProcessing(true);
    try {
      const result = await analyzeStory(story);
      setBlueprints(result.settings);
      setStep(AppStep.ARCHITECT);
    } catch (e) {
      alert("Analysis failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setStep(AppStep.INPUT);
    setStory('');
    setBlueprints([]);
    setFileName(null);
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setFileName(file.name);
    try {
      if (file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        setStory(result.value);
      } else if (file.name.endsWith('.txt')) {
        const text = await file.text();
        setStory(text);
      } else {
        alert("Use .docx or .txt");
        setFileName(null);
      }
    } catch (error) {
      console.error(error);
      setFileName(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const generatePythonScript = () => {
    const settingsDict = blueprints.reduce((acc, bp) => {
      const safePrompt = bp.prompt.replace(/"/g, '\\"');
      return acc + `    "${bp.key}": {\n        "name": "${bp.name}",\n        "prompt": """${safePrompt}"""\n    },\n`;
    }, "{\n") + "}";

    return `import os
import time
from pathlib import Path
from google import genai
from google.genai import types
from getpass import getpass

print("🎬 CINEMATIC SCENE GENERATOR")
print("🎯 Engine: Gemini 3.0 Pro Image Preview")

api_key = input("Paste Gemini API Key: ") or os.environ.get("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)
MODEL = "gemini-3-pro-image-preview" 

# === EXTRACTED SCENES FROM DOC ===
SCENES = ${settingsDict}
# =================================

def generate_scene(key, info):
    path = Path(f"renders/{key}.png")
    if path.exists():
        print(f"⏭️  {key} exists.")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    
    # === CINEMA QUALITY PROMPT INJECTION ===
    full_prompt = f"""
SUBJECT: {info['prompt']}

TECHNICAL SPECS (DO NOT IGNORE):
- CAMERA: Arri Alexa 65, Panavision 70mm Lenses.
- LOOK: Cinematic Color Grading, High Dynamic Range, Ray Tracing Global Illumination.
- STYLE: Photorealistic, Movie Still, 8k UHD.
- COMPOSITION: Wide shot, cinematic framing.

NEGATIVE PROMPT:
- Cartoon, anime, painting, drawing, illustration, 3d render, watermark, text, blur, noise, distortion, bad anatomy, low resolution.
"""
    
    print(f"🎥 Rolling camera: {info['name']}...", end="", flush=True)
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[full_prompt],
            config=types.GenerateContentConfig(
                temperature=0.3, # Low temp for higher fidelity
                image_config=types.ImageConfig(aspect_ratio="16:9") # Cinematic Aspect Ratio
            )
        )
        if response.parts:
            with open(path, "wb") as f:
                f.write(response.parts[0].inline_data.data)
            print(" ✅ CUT! (Saved)")
    except Exception as e:
        print(f" ❌ ACTION FAILED: {e}")

# MAIN LOOP
for key, info in SCENES.items():
    generate_scene(key, info)
    time.sleep(2) 

print("\\n✨ That's a wrap! Check 'renders/' folder.")
`;
  };

  const handleDownloadScript = () => {
    const blob = new Blob([generatePythonScript()], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'render_scenes.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatePythonScript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#050505] to-[#050505] text-slate-300 font-sans selection:bg-gold-500/30">
      
      {/* Header - Minimalist */}
      <header className="fixed top-0 w-full z-50 bg-[#050505]/80 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
           <h1 className="text-lg font-display tracking-widest text-white">
             DREAM<span className="text-white/40">BUILDER</span>
           </h1>
           <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">Cinema Engine v2.0</span>
        </div>
      </header>

      <main className="pt-32 pb-20 px-6 max-w-5xl mx-auto min-h-screen flex flex-col">
        <StepIndicator currentStep={step} />
        
        {step === AppStep.INPUT && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="text-center mb-10">
               <h2 className="text-3xl text-white font-light mb-2">Upload Manuscript</h2>
               <p className="text-slate-500 text-sm">Use tags like <code className="bg-white/10 px-1 rounded text-white">[insert image] setting...</code> to auto-generate scenes.</p>
             </div>

             <div 
               className={`
                 group relative border border-dashed rounded-xl p-12 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer mb-6
                 ${isDragOver ? 'border-gold-500 bg-gold-500/5' : 'border-white/10 hover:border-white/30 hover:bg-white/[0.02]'}
               `}
               onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
               onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
               onDrop={(e) => { 
                 e.preventDefault(); setIsDragOver(false); 
                 if(e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
               }}
               onClick={() => fileInputRef.current?.click()}
             >
               <input type="file" ref={fileInputRef} className="hidden" accept=".txt,.docx" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])} />
               
               {fileName ? (
                 <div className="flex flex-col items-center gap-3">
                   <div className="p-3 bg-white/5 rounded-full">
                     <FileText className="w-8 h-8 text-gold-400" />
                   </div>
                   <div className="text-center">
                     <p className="text-white font-mono text-sm">{fileName}</p>
                     <button onClick={(e) => { e.stopPropagation(); setFileName(null); setStory(''); }} className="mt-2 text-xs text-red-400 hover:text-red-300">Remove</button>
                   </div>
                 </div>
               ) : (
                 <>
                   <Upload className="w-8 h-8 text-white/20 mb-4 group-hover:text-white transition-colors" />
                   <p className="text-slate-400 font-light">Drag .docx / .txt here or click to browse</p>
                 </>
               )}
             </div>

             <div className="relative group">
                <textarea
                  className="w-full h-48 bg-[#0A0A0A] border border-white/10 rounded-xl p-4 text-slate-400 focus:text-white focus:border-white/30 outline-none resize-none font-mono text-xs leading-relaxed transition-all placeholder:text-slate-700"
                  placeholder="Or paste text here... e.g., 'He walked into the room. [insert image] A luxurious futuristic office with neon lights...'"
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                />
                <div className="absolute bottom-4 right-4">
                  <button
                    onClick={handleAnalyze}
                    disabled={!story.trim() || isProcessing}
                    className="flex items-center gap-2 bg-white text-black px-6 py-2 rounded-full font-bold text-xs hover:bg-slate-200 transition-transform active:scale-95 disabled:opacity-50"
                  >
                    {isProcessing ? 'SCANNING...' : 'GENERATE BLUEPRINT'} <Zap className="w-3 h-3" />
                  </button>
                </div>
             </div>
          </div>
        )}

        {step === AppStep.ARCHITECT && (
           <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-2xl text-white font-light">Scene Blueprint</h2>
                  <p className="text-slate-500 text-xs mt-1">Found {blueprints.length} scenes tagged for visualization.</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleReset} className="px-4 py-2 text-xs text-slate-500 hover:text-white transition-colors">RESTART</button>
                  <button
                    onClick={() => setStep(AppStep.SCRIPT)}
                    className="px-6 py-2 bg-white text-black font-bold text-xs rounded-full hover:bg-slate-200 flex items-center gap-2"
                  >
                    <Code className="w-3 h-3" /> CREATE SCRIPT
                  </button>
                </div>
             </div>

             <div className="grid gap-3">
               {blueprints.length === 0 && (
                 <div className="text-center py-20 text-slate-600">No scenes found. Did you use <code className="text-slate-400">[insert image]</code> tags?</div>
               )}
               {blueprints.map((bp, idx) => (
                 <div key={idx} className="bg-white/[0.02] border border-white/5 p-4 rounded-lg hover:bg-white/[0.04] transition-colors group">
                    <div className="flex justify-between mb-2">
                       <span className="font-mono text-[10px] text-gold-500/50 uppercase tracking-widest">{bp.key}</span>
                    </div>
                    <h3 className="text-white font-display text-lg mb-1">{bp.name}</h3>
                    <p className="text-slate-400 text-xs font-light leading-relaxed font-mono opacity-60 group-hover:opacity-100 transition-opacity">{bp.prompt}</p>
                 </div>
               ))}
             </div>
           </div>
        )}

        {step === AppStep.SCRIPT && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 h-[calc(100vh-200px)] flex flex-col">
             <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl text-white font-light">Python Render Script</h2>
                  <p className="text-slate-500 text-xs mt-1">Ready for local execution.</p>
                </div>
                <div className="flex gap-2">
                   <button onClick={handleReset} className="p-2 text-slate-500 hover:text-white transition-colors"><RotateCcw className="w-4 h-4" /></button>
                   <button onClick={handleCopyScript} className="p-2 text-slate-500 hover:text-white transition-colors">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                   </button>
                   <button onClick={handleDownloadScript} className="px-5 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-slate-200 flex items-center gap-2">
                      <Download className="w-3 h-3" /> DOWNLOAD .PY
                   </button>
                </div>
             </div>

             <div className="flex-grow bg-[#0A0A0A] border border-white/10 rounded-lg p-6 overflow-auto custom-scrollbar font-mono text-xs text-slate-400">
                <pre className="whitespace-pre-wrap">{generatePythonScript()}</pre>
             </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;