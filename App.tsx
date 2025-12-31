
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, RenovationStage, GenerationState } from './types.ts';
import MessageBubble from './MessageBubble.tsx';
import { Camera, Send, Upload, RefreshCw, Layers, Film, Image as ImageIcon, UserCheck, UserPlus, AlertCircle } from 'lucide-react';

const INTRO_TEXT_KHMER = `សួស្តី! ខ្ញុំគឺជាអ្នកកែលម្អបន្ទប់ — ត្រៀមខ្លួនជាស្រេចក្នុងការផ្លាស់ប្តូរទីធ្លាដែលទ្រុឌទ្រោម ទៅជាបន្ទប់ក្នុងក្តីសុបិន! 🏗️✨

⚠️ **ចំណាំសំខាន់៖** ដើម្បីបង្កើតរូបភាពបាន អ្នកត្រូវប្រើ API Key ចេញពី **Paid Project** (គណនីដែលមានភ្ជាប់ការបង់ប្រាក់ Billing) នៅក្នុង Google AI Studio។

នេះជារបៀបដែលវាដំណើរការ៖
1️⃣ បង្ហោះរូបថតបន្ទប់ដែលអ្នកចង់កែលម្អ
2️⃣ ខ្ញុំនឹងបង្កើតដំណាក់កាលកែលម្អចំនួន ៤ ជូនអ្នក
3️⃣ អ្នកអាចទាញយក Prompt សម្រាប់បង្កើតវីដេអូបានទៀតផង!

ផ្ញើរូបថតបន្ទប់របស់អ្នកមក ឬអូសរូបភាពទម្លាក់ទីនេះ ហើយយើងចាប់ផ្តើមទាំងអស់គ្នា! 📸`;

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
      return `Stage 1: Demolition. Show this ${roomType} in a state of construction demolition. Debris on floor, broken tiles, removed old fixtures, exposed wooden studs. Keep the architectural layout of the original ${roomType}. Professional construction photography.`;
    case RenovationStage.WALL_PREP:
      return `Stage 2: Wall prep. The ${roomType} is now clean but raw. New drywall installed on walls, fresh plastering, visible electrical conduits, cement floor. Very clean construction shell of a ${roomType}.`;
    case RenovationStage.FLOORING_PAINT:
      return `Stage 3: Flooring and paint. The ${roomType} walls are painted in modern soft white. New high-end flooring (matching ${roomType} usage) is being laid out. Bright natural morning light. No furniture yet.`;
    case RenovationStage.FINAL_DECOR:
      return `Stage 4: Final luxury décor. A stunning, high-end modern ${roomType}. ONLY use furniture and decor appropriate for a ${roomType}. If it is a Bathroom, add luxury vanity and shower, NO BED. If it is a Kitchen, add modern cabinets and island, NO TOILET. Ultra-realistic, interior design magazine style, cinematic lighting, aesthetic and attractive.`;
    default:
      return "";
  }
};

const App: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      role: 'assistant',
      text: INTRO_TEXT_KHMER,
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [currentRoomType, setCurrentRoomType] = useState<string>("Room");
  const [lastGeneratedImages, setLastGeneratedImages] = useState<{ url: string; stage: RenovationStage; label: string }[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkKey = async () => {
      if (typeof window.aistudio !== 'undefined') {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } else {
        setHasApiKey(true);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSelectKey = async () => {
    if (typeof window.aistudio !== 'undefined') {
      try {
        await window.aistudio.openSelectKey();
        setHasApiKey(true);
      } catch (err) {
        console.error("Failed to open key selection:", err);
      }
    }
  };

  const processImage = async (base64Image: string) => {
    if (isProcessing) return;
    
    // Check if key is available
    if (typeof window.aistudio !== 'undefined') {
      const connected = await window.aistudio.hasSelectedApiKey();
      if (!connected) {
        await handleSelectKey();
        return;
      }
    }

    setIsProcessing(true);

    const img = new Image();
    img.src = base64Image;
    await new Promise((resolve) => (img.onload = resolve));
    const detectedRatio = getClosestAspectRatio(img.width, img.height);

    const userId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: userId,
      role: 'user',
      images: [{ url: base64Image, stage: RenovationStage.ORIGINAL, label: STAGE_LABELS[RenovationStage.ORIGINAL] }]
    }]);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: assistantId,
      role: 'assistant',
      text: `កំពុងវិភាគប្រភេទបន្ទប់របស់អ្នក...`,
      isProcessing: true
    }]);

    try {
      // Re-initialize for every call to ensure the latest key is used
      if (!process.env.API_KEY) {
         throw new Error("API_KEY_MISSING");
      }

      const aiIdentify = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const identifyResponse = await aiIdentify.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
            { text: "Identify this room type in one word (Bathroom, Kitchen, Bedroom, LivingRoom, Office)." }
          ]
        }
      });
      
      const roomType = identifyResponse.text?.trim() || "Room";
      setCurrentRoomType(roomType);

      const generatedImages: { url: string; stage: RenovationStage; label: string }[] = [
         { url: base64Image, stage: RenovationStage.ORIGINAL, label: STAGE_LABELS[RenovationStage.ORIGINAL] }
      ];

      const stages = [
        RenovationStage.DEMOLITION,
        RenovationStage.WALL_PREP,
        RenovationStage.FLOORING_PAINT,
        RenovationStage.FINAL_DECOR
      ];

      for (const stage of stages) {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, text: `កំពុងកែច្នៃ ${roomType}: ${STAGE_LABELS[stage]}...` } : m));
        
        // Create new instance for image generation to be safe
        const aiImage = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await aiImage.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
              { text: getStagePrompt(stage, roomType) }
            ]
          },
          config: { 
            imageConfig: { aspectRatio: detectedRatio } 
          }
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

      setLastGeneratedImages(generatedImages);
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: `នេះគឺជាការផ្លាស់ប្តូរ ${roomType} របស់អ្នកក្នុងទម្រង់ ${detectedRatio}!`,
        images: generatedImages,
        isProcessing: false
      } : m));

    } catch (error: any) {
      console.error("API Error Detail:", error);
      let errorMsg = "សូមអភ័យទោស មានបញ្ហាបច្ចេកទេស។ សូមព្យាយាមម្តងទៀត។";
      
      const errorStr = error?.toString() || "";
      if (errorStr.includes("403") || errorStr.includes("permission_denied")) {
        errorMsg = "❌ កំហុសសិទ្ធិចូលប្រើ៖ សូមប្រាកដថាអ្នកបានប្រើ API Key ចេញពី **Paid Project** (មានភ្ជាប់ Billing) ព្រោះម៉ូឌែលបង្កើតរូបភាពតម្រូវឱ្យមានវា។";
      } else if (errorStr.includes("429") || errorStr.includes("quota")) {
        errorMsg = "❌ អស់កូតាប្រើប្រាស់៖ សូមរង់ចាំមួយរយៈ ឬប្តូរ API Key ថ្មី។";
      } else if (errorStr.includes("API_KEY_MISSING")) {
        errorMsg = "❌ មិនទាន់រកឃើញ API Key៖ សូមព្យាយាមចុចប៊ូតុង 'ភ្ជាប់គណនី AI Studio' ម្តងទៀត។";
      } else if (errorStr.includes("not found")) {
        // Reset key selection if entity not found as per instructions
        setHasApiKey(false);
        errorMsg = "❌ រកមិនឃើញគម្រោង៖ ប្រព័ន្ធបានកំណត់ការភ្ជាប់ឡើងវិញ សូមចុចប៊ូតុង 'ភ្ជាប់គណនី' ហើយជ្រើសរើសគម្រោងដែលត្រឹមត្រូវ។";
      }

      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: errorMsg,
        isProcessing: false
      } : m));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateStage = async (messageId: string, stage: RenovationStage) => {
    if (typeof window.aistudio !== 'undefined') {
        const connected = await window.aistudio.hasSelectedApiKey();
        if (!connected) {
            await handleSelectKey();
            return;
        }
    }

    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg || !targetMsg.images) return;
    
    const originalImg = targetMsg.images.find(img => img.stage === RenovationStage.ORIGINAL);
    if (!originalImg) return;

    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isProcessing: true, text: `កំពុងបង្កើត ${STAGE_LABELS[stage]} ឡើងវិញ...` } : m));

    try {
      const img = new Image();
      img.src = originalImg.url;
      await new Promise((resolve) => (img.onload = resolve));
      const detectedRatio = getClosestAspectRatio(img.width, img.height);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: originalImg.url.split(',')[1], mimeType: 'image/png' } },
            { text: getStagePrompt(stage, currentRoomType) + " High quality, cinematic." }
          ]
        },
        config: { 
          imageConfig: { aspectRatio: detectedRatio } 
        }
      });

      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part?.inlineData) {
        const newUrl = `data:image/png;base64,${part.inlineData.data}`;
        setMessages(prev => prev.map(m => m.id === messageId ? {
          ...m,
          text: `ការបង្កើតឡើងវិញសម្រាប់ ${STAGE_LABELS[stage]} រួចរាល់ហើយ!`,
          isProcessing: false,
          images: m.images?.map(img => img.stage === stage ? { ...img, url: newUrl } : img)
        } : m));
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isProcessing: false, text: "មានបញ្ហាក្នុងការបង្កើតឡើងវិញ។ សូមពិនិត្យមើល Billing ក្នុងគណនីរបស់អ្នក។" } : m));
    }
  };

  const providePrompts = () => {
    const roomType = currentRoomType || "Room";
    const structuredPrompts = [
      {
        stage: "Video 1: Original → Stage 1",
        text: `${roomType} demolition timelapse: construction workers in hard hats and work gear actively removing old fixtures. Camera remains perfectly still. Window position stays exact.`
      },
      {
        stage: "Video 2: Stage 1 → Stage 2",
        text: `${roomType} drywall installation timelapse: construction workers installing fresh drywall on walls and ceiling. Professional contractors. Window position stays exact.`
      },
      {
        stage: "Video 3: Stage 2 → Stage 3",
        text: `${roomType} flooring and painting timelapse: workers installing flooring and painting walls white. Professional coordinated renovation work.`
      },
      {
        stage: "Video 4: Stage 3 → Stage 4",
        text: `${roomType} final installation: installers mounting luxury fixtures and furniture. High-end modern design, final cinematic touches.`
      }
    ];

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      text: `នេះគឺជា Prompt សម្រាប់បង្កើតវីដេអូ Timelapse ទាំង ៤ ដំណាក់កាល។ អ្នកអាច Copy ពួកវាទៅប្រើក្នុងម៉ូឌែលបង្កើតវីដេអូ (ដូចជា Veo) បាន!`,
      structuredPrompts,
      images: lastGeneratedImages
    }]);
  };

  return (
    <div 
      className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); if (!isProcessing) setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
      onDrop={(e) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        if (isProcessing) return;
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => processImage(reader.result as string);
          reader.readAsDataURL(file);
        }
      }}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-amber-500/10 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="w-[90%] h-[90%] border-4 border-dashed border-amber-500 rounded-3xl flex flex-col items-center justify-center bg-white/80 animate-in zoom-in">
            <ImageIcon className="w-16 h-16 text-amber-600 mb-4 animate-bounce" />
            <h2 className="text-2xl font-bold text-slate-900 khmer-font">ទម្លាក់រូបភាពដើម្បីចាប់ផ្តើម</h2>
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
            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest">Room Renovator AI</p>
          </div>
        </div>
        <button 
          onClick={handleSelectKey}
          className={`text-xs font-bold py-1.5 px-4 rounded-full transition-all flex items-center gap-2 ${
            hasApiKey ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 animate-pulse shadow-lg'
          }`}
        >
          {hasApiKey ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
          {hasApiKey ? 'គណនីបានភ្ជាប់រួចរាល់' : 'ភ្ជាប់គណនី AI Studio'}
        </button>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 no-scrollbar bg-slate-50 relative"
      >
        {messages.map((msg) => (
          <MessageBubble 
            key={msg.id} 
            message={msg} 
            onGenerateVideo={providePrompts}
            onRegenerateStage={(stage) => handleRegenerateStage(msg.id, stage)}
          />
        ))}
      </div>

      <div className="p-4 bg-white border-t border-slate-200 z-10">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-3 rounded-full bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-600 transition-all disabled:opacity-50"
          >
            <Upload className="w-6 h-6" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="សរសេរសារ ឬផ្ញើរូបភាព..."
              rows={1}
              className="w-full p-3 pr-12 rounded-2xl bg-slate-100 border-none focus:ring-2 focus:ring-amber-500 resize-none khmer-font"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputValue.trim()) {
                    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: inputValue }]);
                    setInputValue('');
                  }
                }
              }}
            />
            <button 
              className="absolute right-2 bottom-2 p-2 text-amber-600"
              disabled={!inputValue.trim() || isProcessing}
              onClick={() => {
                 if (inputValue.trim()) {
                    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', text: inputValue }]);
                    setInputValue('');
                 }
              }}
            >
              <Send className="w-5 h-5" />
            </button>
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
