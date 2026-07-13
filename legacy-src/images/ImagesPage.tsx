import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Image as ImageIcon, Download, Loader2, Sparkles, ChevronDown, Trash2 } from 'lucide-react';
import { useModels } from '../../hooks/useModels';
import { useAuthStore } from '../../stores/auth.store';
import { gatewayApi } from '../../services/api';
import { Button } from '../../ui/Button';
import { toast } from '../../ui/Toast';
import { cn } from '../../lib/utils';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
}

export default function ImagesPage() {
  const { modelId } = useParams();
  const { models } = useModels();
  const user = useAuthStore(s => s.user);
  const [selectedModel, setSelectedModel] = useState<string>(modelId || '');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);
  const [showModelSelect, setShowModelSelect] = useState(false);

  const imageModels = models.filter(m => m.type === 'text-to-image');
  const activeModel = imageModels.find(m => String(m.id) === selectedModel) || imageModels[0];

  const handleGenerate = async () => {
    if (!prompt.trim() || !activeModel || !user?.user_key) return;
    setIsGenerating(true);
    try {
      const data = await gatewayApi.chat(activeModel.endpoint, {
        prompt: prompt.trim(),
        messages: [{ role: 'user', content: prompt.trim() }],
        n: 1,
        size: '1024x1024'
      }, user.user_key);

      const imageResults = data.data || [];
      const newImages: GeneratedImage[] = imageResults.map((img: any, i: number) => ({
        id: `img_${Date.now()}_${i}`,
        url: img.b64_json ? `data:image/png;base64,${img.b64_json}` : (img.url || ''),
        prompt: prompt.trim(),
        timestamp: Date.now()
      }));

      setImages(prev => [...newImages, ...prev]);
      toast.success('Image generated successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (img: GeneratedImage) => {
    const a = document.createElement('a');
    a.href = img.url;
    a.download = `kroma_${img.id}.png`;
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="relative">
          <button
            onClick={() => setShowModelSelect(!showModelSelect)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--color-surface-alt)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-border-hover)] transition-colors"
          >
            <ImageIcon size={14} className="text-[var(--color-primary)]" />
            <span>{activeModel?.name || 'Select model'}</span>
            <ChevronDown size={14} className="text-[var(--color-text-muted)]" />
          </button>
          {showModelSelect && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg z-20 py-1">
              {imageModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setSelectedModel(String(m.id)); setShowModelSelect(false); }}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-alt)] transition-colors',
                    String(m.id) === String(activeModel?.id) && 'bg-[var(--color-primary-light)] text-[var(--color-primary)]'
                  )}
                >
                  <div className="font-medium">{m.name}</div>
                </button>
              ))}
              {imageModels.length === 0 && (
                <div className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">No image models available</div>
              )}
            </div>
          )}
        </div>
        {images.length > 0 && (
          <button
            onClick={() => setImages([])}
            className="ml-auto p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-surface-alt)] transition-colors"
            title="Clear gallery"
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {/* Gallery / Empty state */}
      <div className="flex-1 overflow-y-auto p-4">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
              <ImageIcon size={28} className="text-[var(--color-primary)]" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--color-text)] mb-2">Image Generation</h2>
            <p className="text-sm text-[var(--color-text-muted)] max-w-md">
              Describe the image you want to create and let AI bring it to life.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {images.map(img => (
              <div key={img.id} className="group relative rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
                <img src={img.url} alt={img.prompt} className="w-full aspect-square object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                  <p className="text-white text-xs line-clamp-2 mb-2">{img.prompt}</p>
                  <button
                    onClick={() => handleDownload(img)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-white/20 backdrop-blur text-white text-xs hover:bg-white/30 transition-colors w-fit"
                  >
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
            placeholder={activeModel ? `Describe an image...` : 'Select an image model first...'}
            disabled={!activeModel || isGenerating}
            className={cn(
              'flex-1 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-input-bg)]',
              'px-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)]',
              'focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:border-transparent',
              'disabled:opacity-50'
            )}
          />
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || !activeModel || isGenerating}
            loading={isGenerating}
            icon={!isGenerating ? <Sparkles size={16} /> : undefined}
          >
            Generate
          </Button>
        </div>
      </div>
    </div>
  );
}
