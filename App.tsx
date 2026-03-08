
import React, { useState, useRef, useCallback, ChangeEvent, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Capture } from './types';
import usePersistentState from './hooks/usePersistentState';
import { ScreenshotIcon, GalleryIcon, MagicWandIcon, SaveIcon, ShareIcon, UploadIcon, LinkIcon, CloseIcon, CloneIcon } from './components/Icons';

const App: React.FC = () => {
  const [sourceMedia, setSourceMedia] = useState<File | Blob | null>(null);
  const [mediaType, setMediaType] = useState<'video' | 'image' | null>(null);
  const [captures, setCaptures] = usePersistentState<Capture[]>('magical-captures', []);
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editPrompt, setEditPrompt] = useState('');
  const [editedImageSrc, setEditedImageSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUrlModalOpen, setIsUrlModalOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const animationFrameRef = useRef<number>(null);
  
  useEffect(() => {
    if (!sourceMedia) {
      setMediaUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(sourceMedia);
    setMediaUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sourceMedia]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
        setSourceMedia(file);
        setMediaType('video');
        setSelectedCapture(null);
    } else {
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
            const newCapture: Capture = { id: Date.now(), src: dataUrl };
            setCaptures(prev => [newCapture, ...prev]);
            setSelectedCapture(newCapture);
            setSourceMedia(null);
            setMediaType(null);
        } catch (error) {
            alert("Error al cargar la imagen.");
        }
    }
  };
  
  const handleUrlLoad = async () => {
    if (!urlInput || isLoadingUrl) return;
    setIsLoadingUrl(true);
    try {
      // Intentar cargar directamente primero
      let response;
      try {
        response = await fetch(urlInput);
      } catch (e) {
        // Si falla por CORS, usar proxies
        const proxies = [
          `https://api.allorigins.win/raw?url=${encodeURIComponent(urlInput)}`,
          `https://corsproxy.io/?${encodeURIComponent(urlInput)}`,
          `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(urlInput)}`
        ];
        
        for (const proxy of proxies) {
          try {
            response = await fetch(proxy);
            if (response.ok) break;
          } catch (err) {}
        }
      }

      if (!response || !response.ok) throw new Error("No se pudo acceder al recurso");
      
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Archivo vacío");
      
      let finalMediaType: 'video' | 'image' | null = null;
      if (blob.type.startsWith('video/')) finalMediaType = 'video';
      else if (blob.type.startsWith('image/')) finalMediaType = 'image';
      else {
        // Intentar deducir por extensión si el tipo MIME es genérico
        const ext = urlInput.split('.').pop()?.toLowerCase();
        if (['mp4', 'webm', 'ogg', 'mov'].includes(ext || '')) finalMediaType = 'video';
        else if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext || '')) finalMediaType = 'image';
      }

      if (!finalMediaType) throw new Error("Tipo de archivo no soportado");
      
      if (finalMediaType === 'video') {
        setSourceMedia(blob);
        setMediaType('video');
        setSelectedCapture(null);
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
        });
        const newCapture: Capture = { id: Date.now(), src: dataUrl };
        setCaptures(prev => [newCapture, ...prev]);
        setSelectedCapture(newCapture);
        setSourceMedia(null);
        setMediaType(null);
      }
      setIsUrlModalOpen(false);
      setUrlInput('');
    } catch (error: any) {
      alert(`Error: ${error.message || "No se pudo cargar el enlace mágico."}`);
    } finally {
        setIsLoadingUrl(false);
    }
  };

  const handleCaptureFrame = useCallback(() => {
    if (mediaType === 'video' && videoRef.current) {
      try {
        const video = videoRef.current;
        if (video.readyState < 2) {
          alert("El video aún no está listo para capturar. Espera un segundo.");
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
          const newCapture: Capture = { id: Date.now(), src: dataUrl };
          setCaptures(prev => [newCapture, ...prev]);
          setSelectedCapture(newCapture);
        }
      } catch (error: any) {
        console.error("Error capturando frame:", error);
        alert("No se pudo capturar este video debido a restricciones de seguridad del sitio de origen (CORS). Intenta con un archivo local o un enlace diferente.");
      }
    }
  }, [mediaType, setCaptures]);

  const handleDeleteCapture = (id: number) => {
    setCaptures(prev => prev.filter(c => c.id !== id));
    if (selectedCapture?.id === id) setSelectedCapture(null);
  };

  const handleSaveCapture = () => {
    if (selectedCapture?.src) {
      const link = document.createElement('a');
      link.href = selectedCapture.src;
      link.download = `captura-${Date.now()}.jpg`;
      link.click();
    }
  };

  const handleShareCapture = async () => {
    if (!selectedCapture?.src) return;
    try {
      const res = await fetch(selectedCapture.src);
      const blob = await res.blob();
      const file = new File([blob], `captura.jpg`, { type: 'image/jpeg' });
      if (navigator.share) {
        await navigator.share({ files: [file], title: 'Captura Mágica Estaniel' });
      } else alert('Compartir no disponible.');
    } catch (error) {
      alert('Error al compartir.');
    }
  };

  const handleCloneApp = () => {
    setIsCloneModalOpen(true);
    setIsCloning(true);
    try {
      navigator.clipboard.writeText(window.location.href);
    } catch (e) {}
    setTimeout(() => setIsCloning(false), 1500);
  };

  const openEditModal = async () => {
    if (!selectedCapture) return;
    setEditedImageSrc(selectedCapture.src);
    setEditPrompt('');
    setIsEditing(true);
  }

  const handleEnhance = async () => {
      if (!selectedCapture || !editPrompt.trim() || !editedImageSrc) {
        alert("Por favor, escribe qué quieres mejorar en la imagen.");
        return;
      }
      
      setIsGenerating(true);
      try {
        // Intentar obtener la API KEY de múltiples fuentes
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
        
        if (!apiKey || apiKey === "undefined") {
          throw new Error("No se encontró una clave de API válida. Verifica la configuración.");
        }

        const ai = new GoogleGenAI({ apiKey });
        const base64ImageData = editedImageSrc.split(',')[1];
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [
              { inlineData: { data: base64ImageData, mimeType: 'image/jpeg' } },
              { text: `INSTRUCCIÓN: ${editPrompt}. REGLA: Edita la imagen manteniendo la calidad original.` },
            ],
          },
          config: {
            systemInstruction: "Eres un experto editor de imágenes. Tu tarea es aplicar las modificaciones solicitadas por el usuario manteniendo la calidad y el realismo de la imagen original.",
          },
        });

        if (!response.candidates || response.candidates.length === 0) {
          throw new Error("La IA no devolvió ninguna respuesta.");
        }

        const parts = response.candidates[0].content.parts;
        let foundImage = false;
        for (const part of parts) {
          if (part.inlineData) {
            setEditedImageSrc(`data:image/jpeg;base64,${part.inlineData.data}`);
            foundImage = true;
            break;
          }
        }

        if (!foundImage) {
          const textResponse = parts.find(p => p.text)?.text;
          if (textResponse) alert(`Mensaje de la IA: ${textResponse}`);
          else throw new Error("La IA no generó una imagen nueva.");
        }

      } catch (error: any) {
        console.error("Error en Gemini:", error);
        alert(`Error Mágico: ${error.message || "Error desconocido en la conexión con la IA"}`);
      } finally {
        setIsGenerating(false);
      }
    };

  const handleSaveEnhancedImage = () => {
      if (!editedImageSrc || !selectedCapture) return;
      const newCapture = { ...selectedCapture, src: editedImageSrc };
      setCaptures(prev => prev.map(c => c.id === newCapture.id ? newCapture : c));
      setSelectedCapture(newCapture);
      setIsEditing(false);
  };

  const renderMedia = () => {
    if (selectedCapture) return <img src={selectedCapture.src} className="max-h-full max-w-full object-contain" />;
    if (mediaUrl && mediaType === 'video') {
      return <video ref={videoRef} src={mediaUrl} controls className="max-h-full max-w-full object-contain" onTimeUpdate={() => setVideoProgress(videoRef.current?.currentTime || 0)} onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration || 0)} crossOrigin="anonymous" />;
    }
    return (
        <div className="relative flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <div className="absolute w-48 h-48 md:w-64 md:h-64">
            <div className="w-full h-full rounded-full bg-gradient-to-tr from-[#f00fb0] to-[#00f0ff] upload-ring opacity-30"></div>
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center bg-white/5 border border-white/20 rounded-full w-40 h-40 md:w-56 md:h-56 backdrop-blur-md">
            <UploadIcon className="w-12 h-12 md:w-16 md:h-16 text-[#f00fb0] filter drop-shadow-[0_0_8px_#f00fb0] mb-2" />
            <p className="font-bold text-sm md:text-base text-white">Videos o imágenes</p>
            <p className="text-xs text-white/70">hasta 3 GB</p>
          </div>
        </div>
    );
  };

  const ActionButton: React.FC<{ icon: React.ReactNode; label: string; onClick?: () => void, disabled?: boolean }> = ({ icon, label, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled} className={`action-button flex flex-col items-center gap-2 text-white/70 transition-all duration-300 ${disabled ? 'opacity-30 cursor-not-allowed' : 'hover:text-white hover:drop-shadow-[0_0_8px_#f00fb0]'}`}>
      <div className="aurora-button-container p-3 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
        {icon}
      </div>
      <span className="text-[10px] tracking-widest">{label}</span>
    </button>
  );

  const videoPercentage = videoDuration > 0 ? (videoProgress / videoDuration) * 100 : 0;

  return (
    <div className="h-screen w-screen bg-[#0c0217] text-white overflow-hidden flex flex-col p-4 md:p-8 relative">
      <div className="aurora-background">
        <div className="aurora-layer"></div><div className="aurora-layer"></div>
        <div className="aurora-layer"></div><div className="aurora-layer"></div>
      </div>

      {isUrlModalOpen && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-lg z-50 flex flex-col items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && setIsUrlModalOpen(false)}>
            <div className="bg-black/40 border border-white/20 p-8 rounded-2xl shadow-2xl flex flex-col items-center">
                <h3 className="text-3xl animated-title mb-4">Cargar desde URL</h3>
                <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="Enlace directo del video o imagen..." className="w-full max-w-xl bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-white/50 focus:outline-none mb-6 input-pulse" />
                <div className="flex gap-4">
                  <button onClick={handleUrlLoad} disabled={isLoadingUrl} className="px-6 py-2 bg-pink-600 rounded-lg hover:bg-pink-500 transition-colors">
                    {isLoadingUrl ? 'Canalizando...' : 'Cargar Archivo'}
                  </button>
                  <button onClick={() => setIsUrlModalOpen(false)} className="px-6 py-2 bg-white/10 rounded-lg">Cancelar</button>
                </div>
            </div>
        </div>
      )}

      {isCloneModalOpen && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-4">
            <div className="bg-black/40 border border-pink-500/30 p-8 rounded-2xl shadow-[0_0_50px_rgba(240,15,176,0.3)] flex flex-col items-center max-w-md w-full text-center">
                {isCloning ? (
                    <h3 className="text-2xl font-bold text-white mb-6 animate-pulse">Materializando Clon...</h3>
                ) : (
                    <>
                        <h3 className="text-2xl font-bold animated-title mb-2">¡Clon Mágico Creado!</h3>
                        <div className="w-full bg-white/5 border border-white/10 rounded-lg p-3 flex items-center gap-2 mb-6 font-mono text-sm overflow-hidden whitespace-nowrap">
                            {window.location.href}
                        </div>
                        <button onClick={() => setIsCloneModalOpen(false)} className="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 rounded-lg font-bold">ENTENDIDO</button>
                    </>
                )}
            </div>
        </div>
      )}

      {isEditing && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-lg z-50 flex flex-col items-center justify-center p-4">
            <h3 className="text-3xl animated-title mb-4">Mejora Mágica Pro</h3>
             <div className="relative w-full max-w-2xl h-auto max-h-[50vh] mb-4 bg-black/40 border border-white/10 rounded-xl overflow-hidden">
                 <img src={editedImageSrc || ''} className="w-full h-full object-contain" />
                 {isGenerating && (
                     <div className="absolute inset-0 bg-black/80 flex items-center justify-center flex-col gap-4">
                         <div className="w-12 h-12 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                         <p className="text-pink-300 animate-pulse text-sm">IA de alta fidelidad trabajando...</p>
                     </div>
                 )}
             </div>
             <input value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Instrucciones para la IA (ej: Rostro realista, estilo neón...)" className="w-full max-w-2xl bg-white/5 border border-white/20 rounded-lg px-4 py-3 text-white outline-none mb-4 input-pulse" disabled={isGenerating} />
            <div className="flex gap-4">
                 <button onClick={handleEnhance} disabled={isGenerating || !editPrompt} className="px-6 py-2 bg-pink-600 rounded-full font-bold shadow-lg shadow-pink-500/20 disabled:opacity-50">APLICAR MAGIA</button>
                 <button onClick={handleSaveEnhancedImage} disabled={isGenerating || editedImageSrc === selectedCapture?.src} className="px-6 py-2 bg-purple-600 rounded-full font-bold disabled:opacity-50">GUARDAR</button>
                <button onClick={() => setIsEditing(false)} className="px-6 py-2 bg-white/10 rounded-full">CERRAR</button>
            </div>
        </div>
      )}

      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="video/*,image/*" />

      <header className="text-center py-2 flex flex-col items-center">
        <h1 className="text-3xl md:text-5xl animated-title uppercase tracking-widest">Capturas Mágicas</h1>
        <h2 className="text-xl md:text-2xl animated-title uppercase tracking-[0.2em]">Estaniel</h2>
      </header>

      <main className="flex-grow flex items-center justify-center my-4 min-h-0">
        <div className="w-full h-full grid grid-cols-[auto_1fr_auto] grid-rows-1 gap-4 md:gap-8 items-center">
          <div className="flex flex-col gap-6">
            <ActionButton icon={<ScreenshotIcon className="w-6 h-6" />} label="CAPTURAR" onClick={handleCaptureFrame} disabled={mediaType !== 'video'} />
            <ActionButton icon={<GalleryIcon className="w-6 h-6" />} label="GALERÍA" onClick={() => fileInputRef.current?.click()}/>
            <ActionButton icon={<LinkIcon className="w-6 h-6" />} label="ENLACE" onClick={() => setIsUrlModalOpen(true)} />
            <ActionButton icon={<CloneIcon className="w-6 h-6" />} label="CLONAR" onClick={handleCloneApp} />
          </div>

          <div className="relative w-full h-full flex items-center justify-center bg-black/30 rounded-2xl border border-white/20 backdrop-blur-lg p-2 overflow-hidden ring-2 ring-[#f00fb0]/80 shadow-2xl shadow-[#f00fb0]/30">
            {renderMedia()}
          </div>

          <div className="flex flex-col gap-6">
            <ActionButton icon={<MagicWandIcon className={`w-6 h-6 ${isGenerating ? 'animate-spin text-pink-500' : ''}`} />} label={isGenerating ? "IA..." : "MEJORAR"} onClick={openEditModal} disabled={!selectedCapture || isGenerating} />
            <ActionButton icon={<SaveIcon className="w-6 h-6" />} label="GUARDAR" onClick={handleSaveCapture} disabled={!selectedCapture} />
            <ActionButton icon={<ShareIcon className="w-6 h-6" />} label="COMPARTIR" onClick={handleShareCapture} disabled={!selectedCapture} />
          </div>
        </div>
      </main>

      <footer className="flex flex-col gap-4">
        {mediaType === 'video' && mediaUrl && (
          <div className="flex items-center gap-4 px-4">
            <span className="text-[10px] text-pink-300 uppercase tracking-widest">Tiempo</span>
            <input type="range" min="0" max={videoDuration} value={videoProgress} onChange={(e) => { if(videoRef.current) videoRef.current.currentTime = Number(e.target.value); }} className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer video-slider" style={{ background: `linear-gradient(to right, #f00fb0 ${videoPercentage}%, rgba(255,255,255,0.1) ${videoPercentage}%)`}} />
            <div className="w-6 h-6 rounded-full border-2 border-pink-400 bg-black/30 animate-pulse"></div>
          </div>
        )}
        <div className="gallery-container w-full h-32 bg-black/20 rounded-lg border border-white/10 backdrop-blur-sm p-3 flex items-center gap-4 overflow-x-auto">
            <div className="aurora-background"><div className="aurora-layer"></div></div>
            {captures.length === 0 && <p className="w-full text-center opacity-30 text-xs">Sin capturas recientes</p>}
            {captures.map(capture => (
                <div key={capture.id} onClick={() => setSelectedCapture(capture)} className={`gallery-item relative flex-shrink-0 w-28 h-20 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${selectedCapture?.id === capture.id ? 'border-pink-500 scale-105 shadow-lg shadow-pink-500/50' : 'border-transparent'}`}>
                    <img src={capture.src} className="w-full h-full object-cover" />
                    <button onClick={(e) => { e.stopPropagation(); handleDeleteCapture(capture.id); }} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full hover:bg-red-500">
                        <CloseIcon className="w-3 h-3 text-white" />
                    </button>
                </div>
            ))}
        </div>
      </footer>
    </div>
  );
};

export default App;
