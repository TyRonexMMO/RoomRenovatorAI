
import React, { useState } from 'react';
import { ChatMessage, RenovationStage } from './types.ts';
import { Layers, Film, ChevronRight, ChevronLeft, Download, FolderDown, Video, FileText, Copy, Check, RefreshCw } from 'lucide-react';
import JSZip from 'jszip';

interface Props {
  message: ChatMessage;
  onGenerateVideo?: () => void;
  onRegenerateStage?: (stage: RenovationStage) => void;
}

const MessageBubble: React.FC<Props> = ({ message, onGenerateVideo, onRegenerateStage }) => {
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
      
      // Add images
      if (message.images) {
        message.images.forEach((img, index) => {
          const base64Data = img.url.split(',')[1];
          zip.file(`images/${index + 1}-${img.label.replace(/\s+/g, '-').toLowerCase()}.png`, base64Data, { base64: true });
        });
      }
      
      // Add Prompts
      if (message.structuredPrompts) {
        const promptsTxt = message.structuredPrompts.map(p => `${p.stage}\n${p.text}\n\n`).join('');
        zip.file('renovation-prompts.txt', promptsTxt);
      } else if (message.text && !message.images) {
        zip.file('message.txt', message.text);
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

  const handleDownloadPromptsTxt = () => {
    if (!message.structuredPrompts) return;
    const promptsTxt = message.structuredPrompts.map(p => `${p.stage}\n${p.text}\n\n`).join('');
    const blob = new Blob([promptsTxt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "renovation-prompts.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentStage = message.images?.[activeImageIndex]?.stage;
  const isOriginal = currentStage === RenovationStage.ORIGINAL;

  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'} animate-in fade-in slide-in-from-bottom-2 w-full`}>
      <div className={`max-w-[90%] sm:max-w-[85%] rounded-2xl p-4 ${
        isAssistant 
          ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
          : 'bg-slate-900 text-white shadow-md'
      }`}>
        {/* Text Content */}
        {message.text && (
          <div className="whitespace-pre-wrap leading-relaxed khmer-font mb-2">
            {message.text}
          </div>
        )}

        {/* Structured Prompts Display */}
        {message.structuredPrompts && (
          <div className="mt-4 space-y-4">
            {message.structuredPrompts.map((p, idx) => (
              <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-200 relative group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider khmer-font">{p.stage}</span>
                  <button 
                    onClick={() => handleCopy(p.text, idx)}
                    className="p-1.5 hover:bg-white rounded-md transition-colors text-slate-400 hover:text-amber-600"
                    title="Copy Prompt"
                  >
                    {copiedIndex === idx ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed font-mono bg-white p-2 rounded border border-slate-100 select-all">
                  {p.text}
                </p>
              </div>
            ))}
            
            <div className="flex gap-2">
               <button 
                onClick={handleDownloadPromptsTxt}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95 shadow-sm border border-slate-200"
              >
                <FileText className="w-4 h-4" />
                <span className="text-xs khmer-font">ទាញយក Prompt (.txt)</span>
              </button>
              
              <button 
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="flex-1 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-xl transition-all active:scale-95 shadow-md disabled:opacity-50"
              >
                {isZipping ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <FolderDown className="w-4 h-4" />
                )}
                <span className="text-xs khmer-font">ទាញយក ZIP ទាំងអស់</span>
              </button>
            </div>
          </div>
        )}

        {/* Loading / Progress Indicator */}
        {message.isProcessing && (
          <div className="flex flex-col gap-2 mt-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <div className="flex items-center gap-2 text-amber-600 font-medium">
              <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm khmer-font">
                កំពុងដំណើរការ...
              </span>
            </div>
          </div>
        )}

        {/* Image Display */}
        {isAssistant && message.images && message.images.length > 0 && !message.structuredPrompts && (
          <div className="mt-4 space-y-4">
            <div className="relative rounded-xl overflow-hidden bg-slate-100 group shadow-md border border-slate-200">
              <div className="relative w-full h-auto">
                <img 
                  src={message.images[activeImageIndex].url} 
                  alt={message.images[activeImageIndex].label}
                  className={`w-full h-auto block transition-opacity duration-300 ${message.isProcessing ? 'opacity-50' : 'opacity-100'}`}
                />
                {message.isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin shadow-xl"></div>
                  </div>
                )}
              </div>
              
              <div className="absolute top-2 left-2 flex gap-2">
                <div className="bg-black/60 backdrop-blur-md text-white text-[10px] px-2 py-1 rounded font-bold uppercase tracking-wider khmer-font">
                  {message.images[activeImageIndex].label}
                </div>
              </div>

              <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isOriginal && onRegenerateStage && (
                  <button 
                    onClick={() => onRegenerateStage(currentStage!)}
                    disabled={message.isProcessing}
                    className="bg-white/90 hover:bg-white p-2 rounded-full shadow-lg text-amber-600 transition-transform active:scale-90 disabled:opacity-50"
                    title="បង្កើតដំណាក់កាលនេះឡើងវិញ"
                  >
                    <RefreshCw className={`w-4 h-4 ${message.isProcessing ? 'animate-spin' : ''}`} />
                  </button>
                )}
                <button 
                  onClick={handleDownloadSingle}
                  className="bg-white/90 hover:bg-white p-2 rounded-full shadow-lg text-slate-800 transition-transform active:scale-90"
                  title="ទាញយករូបភាពនេះ"
                >
                  <Download className="w-4 h-4" />
                </button>
              </div>
              
              {message.images.length > 1 && (
                <>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev > 0 ? prev - 1 : message.images!.length - 1))}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  <button 
                    onClick={() => setActiveImageIndex(prev => (prev < message.images!.length - 1 ? prev + 1 : 0))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 p-2 rounded-full backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"
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
                  className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-all ${
                    activeImageIndex === idx ? 'border-amber-500 ring-2 ring-amber-500/20 scale-105' : 'border-transparent opacity-60'
                  }`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {!message.isProcessing && onGenerateVideo && (
                <button 
                  onClick={onGenerateVideo}
                  className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-md"
                >
                  <FileText className="w-4 h-4 text-amber-500" />
                  <span className="text-sm khmer-font">បង្ហាញ Prompt សម្រាប់ Timelapse</span>
                </button>
              )}
              
              <button 
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-4 rounded-xl transition-all active:scale-95 shadow-md disabled:opacity-50"
              >
                {isZipping ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <FolderDown className="w-4 h-4" />
                )}
                <span className="text-sm khmer-font">ទាញយកទាំងអស់ (ZIP)</span>
              </button>
            </div>
          </div>
        )}

        {!isAssistant && message.images && message.images.length > 0 && (
          <div className="mt-2 rounded-xl overflow-hidden border-2 border-slate-700 relative group">
            <img src={message.images[0].url} alt="Upload" className="w-full h-auto max-h-[70vh] object-contain" />
            <button 
              onClick={handleDownloadSingle}
              className="absolute top-2 right-2 bg-white/90 hover:bg-white p-2 rounded-full shadow-lg text-slate-800 opacity-0 group-hover:opacity-100 transition-opacity"
              title="ទាញយករូបភាពដើម"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;
