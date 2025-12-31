
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, RenovationStage } from './types.ts';
import MessageBubble from './MessageBubble.tsx';
import { Send, Upload, Layers, Image as ImageIcon, UserCheck, Key, X, Save, AlertCircle } from 'lucide-react';

const INTRO_TEXT_KHMER = `សួស្តី! ខ្ញុំគឺជាអ្នកកែលម្អបន្ទប់ — ត្រៀមខ្លួនជាស្រេចក្នុងការផ្លាស់ប្តូរទីធ្លាដែលទ្រុឌទ្រោម ទៅជាបន្ទប់ក្នុងក្តីសុបិន! 🏗️✨

⚠️ **ដើម្បីចាប់ផ្តើម៖** សូមចុចប៊ូតុង **"បញ្ចូល API Key"** ខាងលើ រួចដាក់ Key របស់អ្នកពី Google AI Studio។

រូបភាពដែលបានបង្កើត តម្រូវឱ្យមាន API Key ពី **Paid Project** (គណនីដែលមាន Billing)។ ប្រសិនបើអ្នកប្រើ Key ឥតគិតថ្លៃ វាអាចនឹងជួបបញ្ហាក្នុងការបង្កើតរូបភាព។

ផ្ញើរូបថតបន្ទប់របស់អ្នកមក ហើយយើងចាប់ផ្តើមទាំងអស់គ្នា! 📸`;

const STAGE_LABELS: Record<RenovationStage, string> = {
  [RenovationStage.ORIGINAL]: 'រូបភាពដើម',
  [RenovationStage.DEMOLITION]: 'ដំណាក់កាលទី ១៖ ការវាយកម្ទេច',
  [RenovationStage.WALL_PREP]: 'ដំណាក់កាលទី ២៖ ការរៀបចំជញ្ជាំង',
  [RenovationStage.FLOORING_PAINT]: 'ដំណាក់កាលទី ៣៖ ការក្រាលការ៉ូ និងលាបថ្នាំ',
  [RenovationStage.FINAL_DECOR]: 'ដំណាក់កាលទី ៤៖ ការតុបតែងចុងក្រោយ',
};

type SupportedAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9";

const getClosestAspectRatio = (width: number, height: number): SupportedAspectRatio => {
  const ratio = width / height;
  const options: { label: SupportedAspectRatio, value: number }[] = [
    { label: "1:1", value: 1 },
    { label: "3:4", value: 3 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "9:16", value: 9 / 16 },
    { label: "16:9", value: 16 / 9 },
  ];
  return options.reduce((prev, curr) => 
    Math.abs(curr.value - ratio) < Math.abs(prev.value - ratio) ? curr : prev
  ).label;
};

const getStagePrompt = (stage: RenovationStage, roomType: string) => {
  switch (stage) {
    case RenovationStage.DEMOLITION:
      return `Stage 1: Demolition. Show this ${roomType} in construction demolition. Debris, exposed studs, removed fixtures. Cinematic construction lighting.`;
    case RenovationStage.WALL_PREP:
      return `Stage 2: Wall prep. Clean raw room. New drywall, plastering, visible conduits. Professional interior shell.`;
    case RenovationStage.FLOORING_PAINT:
      return `Stage 3: Flooring and paint. Modern soft white walls, luxury floor being installed. Bright natural light.`;
    case RenovationStage.FINAL_DECOR:
      return `Stage 4: Final luxury décor. Stunning, modern ${roomType}. Ultra-realistic interior design magazine style, cinematic lighting.`;
    default:
      return "";
  }
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'assistant', text: INTRO_TEXT_KHMER },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedApiKey, setSavedApiKey] = useState<string>(localStorage.getItem('room_renovator_key') || '');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempKey, setTempKey] = useState(savedApiKey);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const saveKey = () => {
    localStorage.setItem('room_renovator_key', tempKey);
    setSavedApiKey(tempKey);
    setShowKeyModal(false);
  };

  const getEffectiveApiKey = () => {
    return savedApiKey || process.env.API_KEY || '';
  };

  const processImage = async (base64Image: string) => {
    const activeKey = getEffectiveApiKey();
    if (!activeKey) {
      setShowKeyModal(true);
      return;
    }

    setIsProcessing(true);
    const img = new Image();
    img.src = base64Image;
    await new Promise((resolve) => (img.onload = resolve));
    const detectedRatio = getClosestAspectRatio(img.width, img.height);

    const assistantId = Date.now().toString();
    setMessages(prev => [...prev, 
      { id: Date.now().toString(), role: 'user', images: [{ url: base64Image, stage: RenovationStage.ORIGINAL, label: STAGE_LABELS[RenovationStage.ORIGINAL] }] },
      { id: assistantId, role: 'assistant', text: `កំពុងវិភាគបន្ទប់...`, isProcessing: true }
    ]);

    try {
      const ai = new GoogleGenAI({ apiKey: activeKey });
      
      const identifyResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
            { text: "Identify this room type (e.g., Kitchen, Bathroom, Bedroom) in one word." }
          ]
        }
      });
      const roomType = identifyResponse.text?.trim() || "Room";

      const generatedImages: { url: string; stage: RenovationStage; label: string }[] = [
         { url: base64Image, stage: RenovationStage.ORIGINAL, label: STAGE_LABELS[RenovationStage.ORIGINAL] }
      ];

      const stages = [RenovationStage.DEMOLITION, RenovationStage.WALL_PREP, RenovationStage.FLOORING_PAINT, RenovationStage.FINAL_DECOR];

      for (const stage of stages) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: `កំពុងរចនា ${roomType}: ${STAGE_LABELS[stage]}...` } : m));
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
              { text: getStagePrompt(stage, roomType) }
            ]
          },
          config: { imageConfig: { aspectRatio: detectedRatio } }
        });

        const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
        if (part?.inlineData) {
          generatedImages.push({
            url: `data:image/png;base64,${part.inlineData.data}`,
            stage: stage,
            label: STAGE_LABELS[stage]
          });
        }
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: `ការផ្លាស់ប្តូរ ${roomType} ក្នុងទម្រង់ ${detectedRatio} រួចរាល់ហើយ!`,
        images: generatedImages,
        isProcessing: false
      } : m));

    } catch (error: any) {
      console.error(error);
      let errorMsg = "សូមអភ័យទោស មានបញ្ហាបច្ចេកទេស។";
      if (error?.toString().includes("403")) errorMsg = "❌ កំហុស API Key: សូមប្រាកដថា Key របស់អ្នកមានភ្ជាប់ Billing (Paid Project)។";
      
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: errorMsg, isProcessing: false } : m));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden relative"
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={() => !isProcessing && setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => processImage(reader.result as string);
          reader.readAsDataURL(file);
        }
      }}
    >
      {/* API Key Modal */}
      {showKeyModal && (
        <div className="absolute inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold khmer-font flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-50" /> បញ្ចូល API Key
              </h2>
              <button onClick={() => setShowKeyModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-600 khmer-font mb-4">
              សូមបញ្ចូល API Key ពី Google AI Studio របស់អ្នក។ Key នេះនឹងត្រូវបានរក្សាទុកក្នុងកម្មវិធីរុករករបស់អ្នកដោយសុវត្ថិភាព។
            </p>
            <input 
              type="password"
              value={tempKey}
              onChange={(e) => setTempKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full p-3 bg-slate-100 border-2 border-transparent focus:border-amber-500 rounded-xl mb-4 outline-none font-mono"
            />
            <div className="flex gap-2">
              <button 
                onClick={saveKey}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors khmer-font"
              >
                <Save className="w-5 h-5" /> រក្សាទុក
              </button>
            </div>
            <p className="text-[10px] text-slate-400 mt-4 text-center">
              ប្រសិនបើអ្នកមិនទាន់មាន Key ទេ សូមចូលទៅកាន់ <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-amber-600 underline">AI Studio</a>
            </p>
          </div>
        </div>
      )}

      {isDragging && (
        <div className="absolute inset-0 z-50 bg-amber-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="w-[80%] h-[80%] border-4 border-dashed border-amber-500 rounded-3xl flex flex-col items-center justify-center bg-white/90 animate-in zoom-in">
            <ImageIcon className="w-16 h-16 text-amber-600 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold text-slate-900 khmer-font">ទម្លាក់រូបភាពនៅទីនេះ</h2>
          </div>
        </div>
      )}

      <header className="bg-slate-900 text-white p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-lg">
            <Layers className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold khmer-font">អ្នកកែលម្អបន្ទប់</h1>
            <p className="text-[10px] text-slate-400 tracking-widest uppercase">Room Renovator AI</p>
          </div>
        </div>
        <button 
          onClick={() => setShowKeyModal(true)}
          className={`text-xs font-bold py-2 px-4 rounded-full transition-all flex items-center gap-2 ${
            savedApiKey ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500 text-slate-900 animate-pulse'
          }`}
        >
          {savedApiKey ? <UserCheck className="w-4 h-4" /> : <Key className="w-4 h-4" />}
          <span className="khmer-font">{savedApiKey ? 'API Key បានរក្សាទុក' : 'បញ្ចូល API Key ពី AI Studio'}</span>
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-50 no-scrollbar">
        {messages.map((msg) => (
          <MessageBubble 
            key={msg.id} 
            message={msg} 
            onRegenerateStage={(stage) => {
              const original = msg.images?.find(i => i.stage === RenovationStage.ORIGINAL);
              if (original) processImage(original.url);
            }}
          />
        ))}
      </div>

      <div className="p-4 bg-white border-t border-slate-200">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-3 rounded-full bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-600 transition-all"
          >
            <Upload className="w-6 h-6" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="ផ្ញើរូបភាពបន្ទប់ដើម្បីចាប់ផ្តើម..."
              rows={1}
              className="w-full p-3 pr-12 rounded-2xl bg-slate-100 border-none focus:ring-2 focus:ring-amber-500 resize-none khmer-font"
            />
          </div>
        </div>
        <p className="text-[10px] text-center text-slate-400 khmer-font mt-2 flex items-center justify-center gap-1">
          <AlertCircle className="w-3 h-3" /> តម្រូវឱ្យមាន API Key ពី Paid Project ដើម្បីបង្កើតរូបភាព
        </p>
      </div>

      <input type="file" ref={fileInputRef} onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => processImage(reader.result as string);
          reader.readAsDataURL(file);
        }
      }} accept="image/*" className="hidden" />
    </div>
  );
};

export default App;
