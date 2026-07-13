import React from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare, Image, Play, Code, CreditCard } from 'lucide-react';
import { useModels } from '../../hooks/useModels';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';

export default function ModelDetailPage() {
  const { id } = useParams();
  const { models, loading } = useModels();
  const model = models.find(m => String(m.id) === id);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-[var(--color-text-muted)]">Model not found</p>
        <Link to="/models"><Button variant="secondary">Back to Models</Button></Link>
      </div>
    );
  }

  const isText = model.type?.includes('text');
  const playgroundPath = isText ? `/chat/${model.id}` : `/images/${model.id}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Back */}
        <Link to="/models" className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
          <ArrowLeft size={14} /> Back to Models
        </Link>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary-light)] flex items-center justify-center shrink-0">
            {isText ? <MessageSquare size={24} className="text-[var(--color-primary)]" /> : <Image size={24} className="text-[var(--color-primary)]" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-[var(--color-text)]">{model.name}</h1>
              <Badge variant={model.active ? 'success' : 'default'}>{model.active ? 'Active' : 'Inactive'}</Badge>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">{model.description}</p>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Type</div>
            <div className="text-sm font-medium text-[var(--color-text)]">{model.type}</div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Price</div>
            <div className="text-sm font-medium text-[var(--color-text)]">{model.price_per_token || 0} credits</div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Endpoint</div>
            <div className="text-sm font-mono text-[var(--color-text)] truncate">{model.endpoint}</div>
          </div>
          <div className="p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-alt)]">
            <div className="text-xs text-[var(--color-text-muted)] mb-1">Streaming</div>
            <div className="text-sm font-medium text-[var(--color-text)]">{model.is_streaming ? 'Yes' : 'No'}</div>
          </div>
        </div>

        {/* Features */}
        {model.features && model.features.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">Features</h3>
            <div className="flex flex-wrap gap-1.5">
              {model.features.map((f, i) => (
                <Badge key={i} variant="info">{f}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Versions */}
        {model.versions && model.versions.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">Versions</h3>
            <div className="flex flex-wrap gap-1.5">
              {model.versions.map((v, i) => (
                <Badge key={i}>{v}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link to={playgroundPath}>
            <Button icon={<Play size={16} />}>Open Playground</Button>
          </Link>
          <Link to="/docs">
            <Button variant="secondary" icon={<Code size={16} />}>API Docs</Button>
          </Link>
          <Link to="/billing">
            <Button variant="outline" icon={<CreditCard size={16} />}>Buy Credits</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
