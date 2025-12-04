
import React, { useState, useRef } from 'react';
import { AppStep, Blueprint, AnalysisResult } from './types';
import { analyzeStory } from './services/geminiService';
import CustomCursor from './components/CustomCursor';
import Background from './components/Background';
import StepIndicator from './components/StepIndicator';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, Sparkles, Zap, ArrowRight, RotateCcw, Upload, FileText, X, Code, Copy, Check } from 'lucide-react';
import mammoth from 'mammoth';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.INPUT);
  const [story, setStory] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [metrics, setMetrics] = useState<AnalysisResult['analysisMetrics']>();
  const [copied, setCopied] = useState(false);
  
  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Handlers
  const handleAnalyze = async () => {
    if (!story.trim()) return;
    setIsProcessing(true);
    try {
      const result = await analyzeStory(story);
      setBlueprints(result.settings);
      setMetrics(result.analysisMetrics);
      setStep(AppStep.ARCHITECT);
    } catch (e) {
      alert("Analysis failed. Please try again (check API connection).");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProceedToScript = () => {
    setStep(AppStep.SCRIPT);
  };

  const handleReset = () => {
    setStep(AppStep.INPUT);
    setStory('');
    setBlueprints([]);
    setMetrics(undefined);
    setFileName(null);
  };

  // --- FILE UPLOAD LOGIC ---
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
        alert("Please upload a .docx or .txt file");
        setFileName(null);
      }
    } catch (error) {
      console.error("File upload error:", error);
      alert("Error reading file. Please try again.");
      setFileName(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // --- SCRIPT GENERATION LOGIC ---
  const generatePythonScript = () => {
    const settingsDict = blueprints.reduce((acc, bp) => {
      // Escape double quotes in prompt to avoid breaking the python string
      const safePrompt = bp.prompt.replace(/"/g, '\\"');
      return acc + `    "${bp.key}": {\n        "name": "${bp.name}",\n        "prompt": """${safePrompt}"""\n    },\n`;
    }, "{\n") + "}";

    return `import os
import time
from pathlib import Path
from google import genai
from google.genai import types
from getpass import getpass

print("🏢 LUXURY SETTING GENERATOR V2.0")
print("🎯 Purpose: Generating High-End Backgrounds")

api_key = input("Paste Gemini API Key: ") or os.environ.get("GOOGLE_API_KEY")
client = genai.Client(api_key=api_key)
MODEL = "gemini-3-pro-image-preview" # Wajib Pro untuk detail texture

# === INJECTED LUXURY SETTINGS ===
SETTING_DESCRIPTIONS = ${settingsDict}
# ================================

def generate_setting(key, info):
    path = Path(f"references/settings/{key}.png")
    if path.exists():
        print(f"⏭️  {key} exists.")
        return

    path.parent.mkdir(parents=True, exist_ok=True)
    
    # LOGIC: KONSISTENSI & ANTI-ANEH
    # Kita bungkus prompt dari Module 1 dengan 'Quality Enforcers'
    full_prompt = f"""
SCENE: {info['name']}
VISUAL DESCRIPTION: {info['prompt']}

QUALITY & STYLE ENFORCEMENT:
- PHOTOGRAPHY: Wide angle architectural shot, straight lines (no fish-eye distortion).
- LIGHTING: Cinematic depth, soft shadows, expensive ambiance.
- COMPOSITION: Empty room (NO PEOPLE), Rule of thirds, Balanced.
- ORIENTATION: Portrait (9:16).

NEGATIVE PROMPT (AVOID):
- People, characters, messy, dirty, broken, low resolution, blurry, distorted perspective, surreal, cartoon, anime style.
"""
    
    print(f"⏳ Generating {info['name']}...", end="", flush=True)
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=[full_prompt],
            config=types.GenerateContentConfig(
                temperature=0.4,
                image_config=types.ImageConfig(aspect_ratio="9:16")
            )
        )
        if response.parts:
            with open(path, "wb") as f:
                f.write(response.parts[0].inline_data.data)
            print(" ✅ DONE (Luxury Quality)")
    except Exception as e:
        print(f" ❌ ERROR: {e}")

# EXECUTION
for key, info in SETTING_DESCRIPTIONS.items():
    generate_setting(key, info)
    time.sleep(2) # Cooldown

print("\\n✨ All luxury backgrounds generated in 'references/settings/'")
`;
  };

  const handleDownloadScript = () => {
    const scriptContent = generatePythonScript();
    const blob = new Blob([scriptContent], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'luxury_setting_gen.py';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyScript = () => {
    navigator.clipboard.writeText(generatePythonScript());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- RENDERERS ---
  const renderInputStep = () => (
    <div className="w-full max-w-4xl mx-auto animate-float">
      <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-gold-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
        
        <h2 className="text-3xl font-display text-white mb-6 text-center">
          <span className="text-gold-400">Step 1:</span> The Raw Material
        </h2>
        
        {/* Upload Zone */}
        <div 
          className={`
            mb-6 border-2 border-dashed rounded-xl p-8 transition-all duration-300 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden
            ${isDragOver ? 'border-gold-500 bg-gold-500/10' : 'border-slate-700 hover:border-gold-500/50 hover:bg-slate-800/50'}
          `}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".txt,.docx" 
            onChange={onFileChange}
          />
          
          {fileName ? (
            <div className="flex items-center gap-3 z-10">
              <div className="bg-gold-500/20 p-3 rounded-lg">
                <FileText className="w-8 h-8 text-gold-400" />
              </div>
              <div className="text-left">
                <p className="text-white font-tech text-sm">FILE LOADED</p>
                <p className="text-slate-400 text-xs">{fileName}</p>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setFileName(null);
                  setStory('');
                }}
                className="ml-4 p-2 hover:bg-red-500/20 rounded-full group/remove transition-colors"
              >
                <X className="w-4 h-4 text-slate-500 group-hover/remove:text-red-400" />
              </button>
            </div>
          ) : (
            <>
              <Upload className={`w-10 h-10 mb-3 transition-colors ${isDragOver ? 'text-gold-400' : 'text-slate-500'}`} />
              <p className="text-slate-300 font-display mb-1">Upload Manuscript</p>
              <p className="text-slate-500 text-xs font-tech">SUPPORTED: .DOCX, .TXT</p>
            </>
          )}
        </div>

        <div className="relative">
            <div className="absolute -top-3 left-4 bg-slate-900 px-2 text-xs text-slate-500 font-tech">OR PASTE TEXT</div>
            <textarea
            className="w-full h-48 bg-slate-950/80 border border-slate-700 rounded-xl p-6 text-slate-300 focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/50 outline-none resize-none font-serif text-lg leading-relaxed placeholder-slate-600 transition-all duration-300"
            placeholder="Text content will appear here..."
            value={story}
            onChange={(e) => setStory(e.target.value)}
            />
        </div>
        
        <div className="mt-8 flex justify-end">
          <button
            onClick={handleAnalyze}
            disabled={!story.trim() || isProcessing}
            className="relative px-8 py-4 bg-gold-600 hover:bg-gold-500 text-slate-950 font-tech font-bold rounded-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed group overflow-hidden"
          >
            <span className="relative z-10 flex items-center gap-2">
              {isProcessing ? 'ARCHITECT IS THINKING...' : 'INITIATE ARCHITECT'}
              {!isProcessing && <Zap className="w-5 h-5" />}
            </span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderArchitectStep = () => (
    <div className="w-full max-w-6xl mx-auto">
       <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-3xl font-display text-white">
            <span className="text-gold-400">Step 2:</span> The Blueprint
          </h2>
          <p className="text-slate-400 mt-2">The Architect has upgraded your locations to "Luxury Grade".</p>
        </div>
        <button
          onClick={handleProceedToScript}
          className="px-8 py-3 bg-white text-slate-950 font-tech font-bold rounded-lg hover:bg-slate-200 transition-all flex items-center gap-2 group"
        >
          <Code className="w-5 h-5 group-hover:text-gold-600 transition-colors" /> GENERATE SCRIPT
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Metrics Chart */}
        {metrics && (
          <div className="col-span-1 lg:col-span-3 bg-slate-900/40 border border-slate-700/50 rounded-xl p-6 mb-4">
             <h3 className="text-gold-400 font-tech text-sm mb-4">SCENE ANALYSIS DATA</h3>
             <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Luxury', value: metrics.luxuryScore },
                    { name: 'Complexity', value: metrics.complexityScore },
                  ]} layout="vertical">
                    <XAxis type="number" domain={[0, 100]} hide />
                    <YAxis dataKey="name" type="category" width={80} stroke="#94a3b8" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      itemStyle={{ color: '#FACC15' }}
                    />
                    <Bar dataKey="value" barSize={20} radius={[0, 4, 4, 0]}>
                      {[{ name: 'Luxury' }, { name: 'Complexity' }].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#FACC15' : '#64748b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
             </div>
             <div className="mt-2 text-center text-slate-400 text-sm">Detected Mood: <span className="text-white italic">"{metrics.mood}"</span></div>
          </div>
        )}

        {/* Blueprint Cards */}
        {blueprints.map((bp, idx) => (
          <div key={idx} className="bg-slate-900/60 backdrop-blur-md border border-slate-700 rounded-xl p-6 hover:border-gold-500/50 transition-colors duration-300">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs font-tech text-gold-600 bg-gold-500/10 px-2 py-1 rounded">KEY: {bp.key}</span>
            </div>
            <h3 className="text-xl font-display text-white mb-3">{bp.name}</h3>
            <div className="bg-black/30 p-4 rounded-lg border border-white/5 mb-4">
              <p className="text-slate-300 text-sm leading-relaxed font-sans">{bp.prompt}</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 font-tech">
              <Sparkles className="w-3 h-3 text-gold-500" />
              <span>LUXURY PROTOCOL APPLIED</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderScriptStep = () => {
    const scriptContent = generatePythonScript();

    return (
      <div className="w-full max-w-5xl mx-auto animate-float">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-3xl font-display text-white">
            <span className="text-gold-400">Step 3:</span> The Script Factory
          </h2>
          <button
            onClick={handleReset}
            className="px-6 py-2 border border-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" /> NEW DREAM
          </button>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
          {/* Editor Header */}
          <div className="bg-slate-950 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
             <div className="flex items-center gap-4">
               <div className="flex gap-2">
                 <div className="w-3 h-3 rounded-full bg-red-500" />
                 <div className="w-3 h-3 rounded-full bg-yellow-500" />
                 <div className="w-3 h-3 rounded-full bg-green-500" />
               </div>
               <span className="text-slate-400 font-mono text-sm ml-4">luxury_setting_gen.py</span>
             </div>
             <div className="flex gap-3">
               <button 
                 onClick={handleCopyScript}
                 className="p-2 hover:bg-slate-800 rounded-md transition-colors text-slate-400 hover:text-white"
                 title="Copy to Clipboard"
               >
                 {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
               </button>
               <button 
                 onClick={handleDownloadScript}
                 className="flex items-center gap-2 px-4 py-2 bg-gold-600 hover:bg-gold-500 text-slate-950 font-tech font-bold text-xs rounded transition-colors"
               >
                 <Download className="w-4 h-4" /> DOWNLOAD .PY
               </button>
             </div>
          </div>

          {/* Editor Content */}
          <div className="flex-grow overflow-auto p-6 bg-[#0d1117] text-slate-300 font-mono text-sm leading-relaxed relative custom-scrollbar">
             <pre className="whitespace-pre-wrap">{scriptContent}</pre>
          </div>
        </div>
        
        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm font-sans max-w-2xl mx-auto">
            This script contains all your luxury prompts and the logic to generate consistent, high-end backgrounds using Gemini. Run it locally with Python.
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-gold-500/30 overflow-x-hidden">
      <CustomCursor />
      <Background />
      
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-slate-950/80 backdrop-blur-md border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-gold-500 rounded-sm rotate-45 flex items-center justify-center shadow-[0_0_15px_rgba(234,179,8,0.5)]">
               <div className="w-4 h-4 bg-slate-950 rotate-90" />
             </div>
             <h1 className="text-2xl font-display font-bold tracking-widest text-white">
               DREAM<span className="text-gold-500">BUILDER</span>
             </h1>
          </div>
          <div className="text-xs font-tech text-slate-500">
            SYSTEM STATUS: <span className="text-green-500">ONLINE</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-32 pb-20 px-6 min-h-screen flex flex-col">
        <StepIndicator currentStep={step} />
        
        <div className="flex-grow">
          {step === AppStep.INPUT && renderInputStep()}
          {step === AppStep.ARCHITECT && renderArchitectStep()}
          {step === AppStep.SCRIPT && renderScriptStep()}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 border-t border-white/5 text-center">
        <p className="text-slate-600 text-xs font-tech">
          POWERED BY GEMINI 2.5 FLASH & 3.0 PRO • ARCHITECT ENGINE V2.0
        </p>
      </footer>
    </div>
  );
};

export default App;
