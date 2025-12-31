
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, RenovationStage, GenerationState } from './types';
import MessageBubble from './components/MessageBubble';
import { Camera, Send, Upload, RefreshCw, Layers, Film, Image as ImageIcon, UserCheck, UserPlus } from 'lucide-react';

const INTRO_TEXT_KHMER = `សួស្តី! ខ្ញុំគឺជាអ្នកកែលម្អបន្ទប់ — ត្រៀមខ្លួនជាស្រេចក្នុងការផ្លាស់ប្តូរទីធ្លាដែលទ្រុឌទ្រោម ទៅជាបន្ទប់ក្នុងក្តីសុបិន! 🏗️✨

ដើម្បីដំណើរការបានល្អបំផុត សូមចុចប៊ូតុង **"ភ្ជាប់គណនី AI Studio"** ខាងលើ ដើម្បីប្រើប្រាស់ API ផ្ទាល់ខ្លួនរបស់អ្នកពី Google AI Studio។

នេះជារបៀបដែលវាដំណើរការ៖

1️⃣ បង្ហោះរូបថតបន្ទប់ដែលអ្នកចង់កែលម្អ (រូបថតដែលបន្ទប់ទទេ ឬទ្រុឌទ្រោម)

2️⃣ ខ្ញុំនឹងបង្កើតដំណាក់កាលកែលម្អចំនួន ៤៖
ដំណាក់កាលទី ១៖ ការវាយកម្ទេច
ដំណាក់កាលទី ២៖ ការរៀបចំជញ្ជាំង និងការបូកកំបោរ
ដំណាក់កាលទី ៣៖ ការក្រាលការ៉ូ និងការលាបថ្នាំ
ដំណាក់កាលទី ៤៖ ការតុបតែងចុងក្រោយ

3️⃣ អ្នកអាចចុច **"បង្កើតឡើងវិញ"** លើដំណាក់កាលណាមួយដែលមិនទាន់ពេញចិត្ត និងអាចទាញយក Prompt សម្រាប់បង្កើតវីដេអូបានទៀតផង!

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
        // In development or non-iframe environments, assume key is from environment
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
        // After opening, we assume success as per instructions
        setHasApiKey(true);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          text: "អបអរសាទរ! អ្នកបានភ្ជាប់គណនី Google AI Studio រួចរាល់ហើយ។ ឥឡូវនេះអ្នកអាចចាប់ផ្តើមបង្កើតរូបភាពកែលម្អបន្ទប់បានហើយ! 🚀"
        }]);
      } catch (err) {
        console.error("Failed to open key selection:", err);
      }
    }
  };

  const ensureKeyConnected = async () => {
    if (typeof window.aistudio !== 'undefined') {
      const connected = await window.aistudio.hasSelectedApiKey();
      if (!connected) {
        await handleSelectKey();
        return await window.aistudio.hasSelectedApiKey();
      }
    }
    return true;
  };

  const processImage = async (base64Image: string) => {
    if (isProcessing) return;
    
    const isConnected = await ensureKeyConnected();
    if (!isConnected && typeof window.aistudio !== 'undefined') return;

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const identifyResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
            { text: "What type of room is this? Answer with only one word (e.g., Bathroom, Kitchen, Bedroom, LivingRoom, Office)." }
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
        
        const response = await ai.models.generateContent({
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
        text: `នេះគឺជាការផ្លាស់ប្តូរ ${roomType} របស់អ្នកក្នុងទម្រង់ ${detectedRatio}! អ្នកអាចមើលពីការវិវត្តន៍តាមដំណាក់កាលនីមួយៗខាងក្រោម ហើយអ្នកក៏អាចចុច "បង្កើតឡើងវិញ" ប្រសិនបើមិនទាន់ពេញចិត្តនឹងដំណាក់កាលណាមួយ។`,
        images: generatedImages,
        isProcessing: false
      } : m));

    } catch (error: any) {
      console.error(error);
      const isQuotaError = error?.message?.includes("429") || error?.message?.includes("quota");
      
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: isQuotaError 
          ? 'សូមអភ័យទោស! អាខោនរបស់អ្នកអស់កូតាប្រើប្រាស់ហើយ។ សូមពិនិត្យមើលក្នុង Google AI Studio ឬប្តូរ Project ថ្មី។'
          : 'សូមអភ័យទោស មានបញ្ហាបច្ចេកទេស។ សូមព្យាយាមម្តងទៀត។',
        isProcessing: false
      } : m));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateStage = async (messageId: string, stage: RenovationStage) => {
    const isConnected = await ensureKeyConnected();
    if (!isConnected && typeof window.aistudio !== 'undefined') return;

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
            { text: getStagePrompt(stage, currentRoomType) + " Generate a different variation from before." }
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
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isProcessing: false, text: "មានបញ្ហាក្នុងការបង្កើតឡើងវិញ។ សូមពិនិត្យការភ្ជាប់ API របស់អ្នក។" } : m));
    }
  };

  const providePrompts = () => {
    const roomType = currentRoomType || "Room";
    const structuredPrompts = [
      {
        stage: "Video 1: Original → Stage 1",
        text: `${roomType} demolition timelapse: construction workers in hard hats and work gear actively removing old cabinets, appliances, peeling wallpaper, and debris. Workers use crowbars, hammers, and tools to strip the ${roomType} down to bare walls. Dust and debris visible as everything is torn out. Camera remains perfectly still in doorway POV. Window position stays exact. Realistic construction site activity with multiple workers coordinating the demo work.`
      },
      {
        stage: "Video 2: Stage 1 → Stage 2",
        text: `${roomType} drywall installation timelapse: construction workers in work gear measuring, cutting, and installing fresh drywall sheets on walls and ceiling. Workers apply joint compound and tape seams. Ladders and drywall tools visible. Professional contractors working efficiently. Camera remains perfectly still in doorway POV. Window position stays exact. Floor remains unchanged with old textures visible.`
      },
      {
        stage: "Video 3: Stage 2 → Stage 3",
        text: `${roomType} flooring and painting timelapse: construction workers installing flooring planks piece by piece. Other workers on ladders painting walls and ceiling white with rollers and brushes. Professional coordinated renovation work. Camera remains perfectly still in doorway POV. Window position stays exact. Walls transform from bare drywall to painted white.`
      },
      {
        stage: "Video 4: Stage 3 → Stage 4",
        text: `${roomType} final installation timelapse: construction workers and installers mounting final fixtures, cabinets, and furniture appropriate for a ${roomType}. Connecting appliances, backsplash tiles, and final decor placement. Final touches with decor placement and cleaning. Professional finish work. Camera remains perfectly still in doorway POV. Window position stays exact. ${roomType} transforms to completed modern design.`
      }
    ];

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      text: `នេះគឺជា Prompt សម្រាប់បង្កើតវីដេអូ Timelapse ទាំង ៤ ដំណាក់កាលសម្រាប់ ${roomType} របស់អ្នក។ អ្នកអាច Copy ពួកវា ឬទាញយកជា ZIP រួមជាមួយរូបភាពបាន!`,
      structuredPrompts,
      images: lastGeneratedImages
    }]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        processImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isProcessing) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isProcessing) return;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          processImage(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  return (
    <div 
      className="flex flex-col h-screen max-w-4xl mx-auto bg-white shadow-2xl overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-amber-500/10 backdrop-blur-sm flex items-center justify-center p-8 pointer-events-none">
          <div className="w-full h-full border-4 border-dashed border-amber-500 rounded-3xl flex flex-col items-center justify-center bg-white/80 animate-in fade-in zoom-in duration-300">
            <div className="bg-amber-100 p-6 rounded-full mb-4 animate-bounce">
              <ImageIcon className="w-16 h-16 text-amber-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 khmer-font mb-2">ទម្លាក់រូបភាពនៅទីនេះ</h2>
            <p className="text-slate-600 khmer-font">ដើម្បីចាប់ផ្តើមការកែលម្អបន្ទប់របស់អ្នក</p>
          </div>
        </div>
      )}

      <header className="bg-slate-900 text-white p-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-lg">
            <Layers className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight khmer-font">អ្នកកែលម្អបន្ទប់</h1>
            <div className="flex items-center gap-2">
               <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Room Renovator AI</p>
               <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30">GEMINI 2.5 FLASH</span>
            </div>
          </div>
        </div>
        <button 
          onClick={handleSelectKey}
          className={`text-xs font-bold py-1.5 px-4 rounded-full transition-all flex items-center gap-2 ${
            hasApiKey ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 animate-pulse'
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
        {!hasApiKey && messages.length === 1 && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl mb-4 animate-in fade-in slide-in-from-top-4">
             <div className="flex items-start gap-3">
               <div className="bg-amber-500 p-2 rounded-lg mt-1">
                 <UserPlus className="w-5 h-5 text-white" />
               </div>
               <div>
                  <h3 className="font-bold text-slate-900 khmer-font">សូមភ្ជាប់គណនី AI Studio របស់អ្នក</h3>
                  <p className="text-sm text-slate-600 khmer-font mt-1">ដើម្បីប្រើប្រាស់កម្មវិធីនេះ អ្នកចាំបាច់ត្រូវភ្ជាប់គណនី Google AI Studio ផ្ទាល់ខ្លួន ដើម្បីទទួលបាន API Key។ វាឥតគិតថ្លៃ និងមានសុវត្ថិភាព!</p>
                  <button 
                    onClick={handleSelectKey}
                    className="mt-3 bg-slate-900 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors khmer-font"
                  >
                    ភ្ជាប់ឥឡូវនេះ
                  </button>
               </div>
             </div>
          </div>
        )}
        
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
            title="Upload room photo"
          >
            <Upload className="w-6 h-6" />
          </button>
          
          <div className="flex-1 relative">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="សរសេរសារនៅទីនេះ ឬអូសរូបភាពទម្លាក់..."
              rows={1}
              className="w-full p-3 pr-12 rounded-2xl bg-slate-100 border-none focus:ring-2 focus:ring-amber-500 resize-none khmer-font"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputValue.trim()) {
                    const id = Date.now().toString();
                    setMessages(prev => [...prev, { id, role: 'user', text: inputValue }]);
                    setInputValue('');
                  }
                }
              }}
            />
            <button 
              className="absolute right-2 bottom-2 p-2 text-amber-600 hover:scale-110 transition-transform"
              disabled={!inputValue.trim() || isProcessing}
              onClick={() => {
                 if (inputValue.trim()) {
                    const id = Date.now().toString();
                    setMessages(prev => [...prev, { id, role: 'user', text: inputValue }]);
                    setInputValue('');
                 }
              }}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center mt-2 gap-1">
          <p className="text-[10px] text-center text-slate-400 khmer-font">
            ប្រើប្រាស់បច្ចេកវិទ្យា Gemini 2.5 Flash Image សម្រាប់ការបង្កើតរូបភាព
          </p>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
    </div>
  );
};

export default App;
