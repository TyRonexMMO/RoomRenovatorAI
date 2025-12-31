
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { ChatMessage, RenovationStage } from './types';
import { 
  Camera, 
  Send, 
  Upload, 
  RefreshCw, 
  Layers, 
  Film, 
  Image as ImageIcon,
  Download,
  FolderDown,
  FileText,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import JSZip from 'jszip';

const INTRO_TEXT_KHMER = `សួស្តី! ខ្ញុំគឺ Room Renovator — ត្រៀមខ្លួនរួចជាស្រេចដើម្បីកែប្រែទីធ្លាដែលទ្រុឌទ្រោម ឱ្យក្លាយជាបន្ទប់ក្នុងក្តីស្រមៃ! 🏗️✨

ខ្ញុំនៅតែបន្តរៀន និងកែលម្អ ដូច្នេះប្រសិនបើខ្ញុំមិនឆ្លើយតប ឬមានអ្វីមួយមិនប្រក្រតី សូមផ្ទុកទំព័រឡើងវិញ (reload) ហើយយើងនឹងចាប់ផ្តើមឡើងវិញ។

នេះជារបៀបដែលវាដំណើរការ៖

1️⃣ បង្ហោះរូបថតបន្ទប់ដែលអ្នកចង់កែលម្អ (តាមការគួរ គឺជាកន្លែងដែលទទេ ឬទ្រុឌទ្រោម)

2️⃣ ខ្ញុំនឹងបង្កើតដំណាក់កាលកែលម្អចំនួន ៤៖
   - ដំណាក់កាលទី ១៖ ការវាយកម្ទេច
   - ដំណាក់កាលទី ២៖ ការរៀបចំជញ្ជាំង និងការបូកកំបោរ
   - ដំណាក់កាលទី ៣៖ ការក្រាលការ៉ូ និងការលាបថ្នាំ
   - ដំណាក់កាលទី ៤៖ ការតុបតែងចុងក្រោយ

3️⃣ ជាជម្រើស ខ្ញុំនឹងចងក្រងវាទៅជា "Prompts" សម្រាប់វីដេអូ timelapse ជាមួយនឹងកម្មករ ឬការផ្លាស់ប្តូរដែលប្រកបដោយភាពច្នៃប្រឌិត

ផ្ញើរូបថតបន្ទប់របស់អ្នកមក ហើយពួកយើងចាប់ផ្តើមទាំងអស់គ្នា! 📸`;

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

// Internal Component to avoid resolution issues
const MessageBubble: React.FC<{
  message: ChatMessage;
  onGenerateVideo?: () => void;
  onRegenerateStage?: (stage: RenovationStage) => void;
}> = ({ message, onGenerateVideo, onRegenerateStage }) => {
  const isAssistant = message.role === 'assistant';
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isZipping, setIsZipping] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleDownloadSingle = () => {
    if (!message.images) return;
    const activeImg = message.images[activeImageIndex];
    const a = document.createElement('a');
    a.href = activeImg.url;
    a.download = `renovator-${activeImg.label.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      const zip = new JSZip();
      if (message.images) {
        message.images.forEach((img, index) => {
          const base64Data = img.url.split(',')[1];
          zip.file(`images/${index + 1}-${img.label.replace(/\s+/g, '-').toLowerCase()}.png`, base64Data, { base64: true });
        });
      }
      if (message.structuredPrompts) {
        const promptsTxt = message.structuredPrompts.map(p => `${p.stage}\n${p.text}\n\n`).join('');
        zip.file('renovation-prompts.txt', promptsTxt);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = "room-renovation-package.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to generate ZIP:", error);
    } finally {
      setIsZipping(false);
    }
  };

  const currentStage = message.images?.[activeImageIndex]?.stage;
  const isOriginal = currentStage === RenovationStage.ORIGINAL;

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 w-full mb-4`}>
      <div className={`max-w-[95%] sm:max-w-[85%] rounded-2xl p-4 ${
        isAssistant 
          ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
          : 'bg-slate-900 text-white shadow-md'
      }`}>
        {message.text && (
          <div className="whitespace-pre-wrap leading-relaxed khmer-font mb-2 text-[15px]">
            {message.text}
          </div>
        )}

        {message.structuredPrompts && (
          <div className="mt-4 space-y-4">
            {message.structuredPrompts.map((p, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-200 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider khmer-font">{p.stage}</span>
                  <button 
                    onClick={() => handleCopy(p.text, idx)}
                    className="p-1.5 hover:bg-white rounded-md transition-colors text-slate-400 hover:text-amber-600"
                  >
                    {copiedIndex === idx ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[13px] text-slate-600 leading-relaxed font-mono bg-white p-2 rounded border border-slate-100 select-all">
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        )}

        {message.isProcessing && (
          <div className="flex flex-col gap-2 mt-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 text-amber-600 font-medium">
              <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm khmer-font">កំពុងដំណើរការ...</span>
            </div>
          </div>
        )}

        {isAssistant && message.images && message.images.length > 0 && !message.structuredPrompts && (
          <div className="mt-4 space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100 group shadow-md border border-slate-200">
              <div className="relative w-full h-auto">
                <img 
                  src={message.images[activeImageIndex].url} 
                  alt={message.images[activeImageIndex].label}
                  className={`w-full h-auto block transition-opacity duration-300 ${message.isProcessing ? 'opacity-50' : 'opacity-100'}`}
                />
              </div>
              
              <div className="absolute top-2 left-2 flex gap-2">
                <div className="bg-black/70 backdrop-blur-md text-white text-[11px] px-3 py-1.5 rounded-lg font-bold uppercase tracking-wider khmer-font">
                  {message.images[activeImageIndex].label}
                </div>
              </div>

              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isOriginal && onRegenerateStage && (
                  <button 
                    onClick={() => onRegenerateStage(currentStage!)}
                    disabled={message.isProcessing}
                    className="bg-white/95 hover:bg-white p-2.5 rounded-full shadow-lg text-amber-600 transition-transform active:scale-90 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${message.isProcessing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button 
                  onClick={handleDownloadSingle}
                  className="bg-white/95 hover:bg-white p-2.5 rounded-full shadow-lg text-slate-800 transition-transform active:scale-90"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
              
              {message.images.length > 1 && (
                <>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev > 0 ? prev - 1 : message.images!.length - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 p-2.5 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev < message.images!.length - 1 ? prev + 1 : 0))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 p-2.5 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                </>
              )}
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {message.images.map((img, idx) => (
                <button 
                  key={idx}
                  onClick={() => setActiveImageIndex(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                    activeImageIndex === idx ? 'border-amber-500 ring-2 ring-amber-500/20 scale-105' : 'border-transparent opacity-60'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!message.isProcessing && onGenerateVideo && (
                <button 
                  onClick={onGenerateVideo}
                  className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 shadow-md"
                >
                  <Film className="w-4 h-4 text-amber-500" />
                  <span className="text-[13px] khmer-font">បង្ហាញ Prompt សម្រាប់ Timelapse</span>
                </button>
              )}
              
              <button 
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 shadow-md disabled:opacity-50"
              >
                {isZipping ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <FolderDown className="w-4 h-4" />
                )}
                <span className="text-[13px] khmer-font">ទាញយកទាំងអស់ (ZIP)</span>
              </button>
            </div>
          </div>
        )}

        {!isAssistant && message.images && message.images.length > 0 && (
          <div className="mt-2 rounded-xl overflow-hidden border-2 border-slate-700 relative group">
            <img src={message.images[0].url} alt="Upload" className="w-full h-auto max-h-[70vh] object-contain" />
          </div>
        )}
      </div>
    </div>
  );
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
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }
  };

  const processImage = async (base64Image: string) => {
    if (isProcessing) return;
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
        text: `នេះគឺជាការផ្លាស់ប្តូរ ${roomType} របស់អ្នក! អ្នកអាចមើលការវិវត្តន៍តាមដំណាក់កាលនីមួយៗខាងក្រោម ហើយអ្នកក៏អាចចុច "បង្កើតឡើងវិញ" ប្រសិនបើមិនទាន់ពេញចិត្តនឹងដំណាក់កាលណាមួយ។`,
        images: generatedImages,
        isProcessing: false
      } : m));

    } catch (error: any) {
      console.error(error);
      const errorMessage = error?.message?.includes("entity was not found") 
        ? "សូមជ្រើសរើស API Key ឡើងវិញដើម្បីបន្ត។"
        : 'សូមអភ័យទោស មានបញ្ហាបច្ចេកទេស។ សូមព្យាយាមម្តងទៀត ឬ Reload ទំព័រ។';
      
      setMessages(prev => prev.map(m => m.id === assistantId ? {
        ...m,
        text: errorMessage,
        isProcessing: false
      } : m));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRegenerateStage = async (messageId: string, stage: RenovationStage) => {
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
      setMessages(prev => prev.map(m => m.id === messageId ? { ...m, isProcessing: false, text: "មានបញ្ហាក្នុងការបង្កើតឡើងវិញ។ សូមព្យាយាមម្តងទៀត។" } : m));
    }
  };

  const providePrompts = () => {
    const roomType = currentRoomType || "Room";
    const structuredPrompts = [
      {
        stage: "Video 1: Original → Stage 1 (Demolition)",
        text: `${roomType} demolition timelapse: construction workers in hard hats and work gear actively removing old cabinets, appliances, peeling wallpaper, and debris. Camera remains perfectly still in doorway POV. Window position stays exact. Realistic construction site activity.`
      },
      {
        stage: "Video 2: Stage 1 → Stage 2 (Prep)",
        text: `${roomType} drywall installation timelapse: construction workers in work gear measuring, cutting, and installing fresh drywall sheets on walls and ceiling. Professional contractors working efficiently. Camera remains perfectly still in doorway POV.`
      },
      {
        stage: "Video 3: Stage 2 → Stage 3 (Flooring & Paint)",
        text: `${roomType} flooring and painting timelapse: construction workers installing flooring planks piece by piece. Other workers on ladders painting walls and ceiling white with rollers. Walls transform from bare drywall to painted white.`
      },
      {
        stage: "Video 4: Stage 3 → Stage 4 (Decor)",
        text: `${roomType} final installation timelapse: construction workers mounting final fixtures, cabinets, and furniture appropriate for a ${roomType}. Connecting appliances, final decor placement. Professional finish work. Stunning modern transformation.`
      }
    ];

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      text: `នេះគឺជា Prompt សម្រាប់បង្កើតវីដេអូ Timelapse ទាំង ៤ ដំណាក់កាលសម្រាប់ ${roomType} របស់អ្នក។ អ្នកអាច Copy ពួកវាបាន!`,
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
        const files = e.dataTransfer.files;
        if (files && files.length > 0 && files[0].type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onloadend = () => processImage(reader.result as string);
          reader.readAsDataURL(files[0]);
        }
      }}
    >
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

      <header className="bg-slate-900 text-white p-4 flex items-center justify-between z-10 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2.5 rounded-xl shadow-lg shadow-amber-500/20">
            <Layers className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight khmer-font">អ្នកកែលម្អបន្ទប់</h1>
            <div className="flex items-center gap-2">
               <p className="text-[10px] text-slate-400 font-medium uppercase tracking-[0.2em]">Room Renovator AI</p>
               <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 font-bold">GEMINI 2.5</span>
            </div>
          </div>
        </div>
        <button 
          onClick={handleSelectKey}
          className={`text-[11px] font-bold py-1.5 px-4 rounded-lg transition-all khmer-font ${
            hasApiKey ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20'
          }`}
        >
          {hasApiKey ? 'API KEY បានភ្ជាប់' : 'ភ្ជាប់ API KEY'}
        </button>
      </header>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-2 no-scrollbar bg-slate-50 relative"
      >
        <div className="max-w-3xl mx-auto w-full pt-4">
          {messages.map((msg) => (
            <MessageBubble 
              key={msg.id} 
              message={msg} 
              onGenerateVideo={providePrompts}
              onRegenerateStage={(stage) => handleRegenerateStage(msg.id, stage)}
            />
          ))}
        </div>
      </div>

      <div className="p-4 bg-white border-t border-slate-200 z-10">
        <div className="flex items-end gap-3 max-w-3xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-3.5 rounded-2xl bg-slate-100 text-slate-600 hover:bg-amber-100 hover:text-amber-600 transition-all disabled:opacity-50 shadow-sm border border-slate-200"
          >
            <Upload className="w-6 h-6" />
          </button>
          
          <div className="flex-1 relative group">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="សរសេរសារ ឬអូសរូបភាពទម្លាក់..."
              rows={1}
              className="w-full p-4 pr-14 rounded-2xl bg-slate-100 border-none focus:ring-2 focus:ring-amber-500/50 resize-none khmer-font text-[15px] shadow-sm transition-all"
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
              className="absolute right-2 bottom-2 p-2.5 bg-amber-500 text-white rounded-xl shadow-lg shadow-amber-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
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
        <div className="flex flex-col items-center mt-3 gap-1 opacity-50">
          <p className="text-[10px] text-center text-slate-500 khmer-font">
            រចនាដោយប្រើប្រាស់បច្ចេកវិទ្យា Gemini Flash 2.5 សម្រាប់ការកែច្នៃរូបភាព
          </p>
        </div>
      </div>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onloadend = () => processImage(reader.result as string);
            reader.readAsDataURL(file);
          }
        }} 
        accept="image/*" 
        className="hidden" 
      />
    </div>
  );
};

export default App;
