import { useEffect, useState, useCallback } from "react";
import { Volume2, Loader2, Check, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useTTS } from "@/lib/useTTS";

const DEMO_SAMPLE =
  "Olá, sou seu mentor de amadurecimento. Vou te dizer a verdade com respeito, mas sem rodeios. Qual é a primeira coisa que você precisa encarar hoje?";

export function VoiceSettingsDialog({
  open,
  onOpenChange,
  selectedVoiceId,
  onSave,
  saveLabel = "Salvar configuração",
  title = "Escolha a voz do seu mentor",
  description = "Ouça uma demonstração de cada voz e escolha a que mais combina com você.",
  showSave = true,
}) {
  const { speak, stop, playingId, loadingId } = useTTS();
  const [voices, setVoices] = useState([]);
  const [selected, setSelected] = useState(selectedVoiceId);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSelected(selectedVoiceId);
  }, [selectedVoiceId]);

  useEffect(() => {
    let mounted = true;
    if (!open) return;
    api
      .get("/voices")
      .then(({ data }) => {
        if (!mounted) return;
        setVoices(data.voices || []);
        setLoaded(true);
      })
      .catch(() => {
        if (!mounted) return;
        setLoaded(true);
      });
    return () => {
      mounted = false;
      stop();
    };
  }, [open, stop]);

  const playDemo = useCallback(
    (voice) => {
      speak(`demo-${voice.id}`, DEMO_SAMPLE, { demo: true, voice_id: voice.id });
    },
    [speak]
  );

  const handleSave = async () => {
    if (!onSave || !selected) return;
    setSaving(true);
    try {
      await onSave(selected);
      onOpenChange?.(false);
    } finally {
      setSaving(false);
    }
  };

  const maleVoices = voices.filter((v) => v.gender === "male");
  const femaleVoices = voices.filter((v) => v.gender === "female");

  function VoiceCard({ voice }) {
    const isSelected = selected === voice.id;
    const isPlaying = playingId === `demo-${voice.id}`;
    const isLoading = loadingId === `demo-${voice.id}`;
    return (
      <button
        type="button"
        onClick={() => setSelected(voice.id)}
        className={`w-full text-left rounded-2xl border p-4 transition-all ${
          isSelected
            ? "border-[var(--terracotta)] bg-[var(--terracotta)]/10 shadow-sm"
            : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-accent)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-serif-display text-lg font-semibold text-[var(--text-primary)]">
                {voice.label}
              </span>
              {isSelected && <Check size={16} className="text-[var(--terracotta)] shrink-0" />}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
              {voice.description}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) stop();
              else playDemo(voice);
            }}
            className="grid place-items-center h-10 w-10 shrink-0 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-colors"
            aria-label={isPlaying ? "Parar demo" : "Ouvir demo"}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPlaying ? (
              <Sparkles size={16} className="animate-pulse" />
            ) : (
              <Volume2 size={16} />
            )}
          </button>
        </div>
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { stop(); onOpenChange?.(v); }}>
      <DialogContent className="max-w-xl !bg-[var(--bg-main)] !border-[var(--border)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="font-serif-display text-2xl">{title}</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {!loaded ? (
            <div className="py-12 grid place-items-center text-[var(--text-muted)]">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-5">
              {femaleVoices.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <span className="eyebrow">Vozes femininas</span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid gap-3">
                    {femaleVoices.map((v) => (
                      <VoiceCard key={v.id} voice={v} />
                    ))}
                  </div>
                </div>
              )}
              {maleVoices.length > 0 && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 px-1">
                    <span className="eyebrow">Vozes masculinas</span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid gap-3">
                    {maleVoices.map((v) => (
                      <VoiceCard key={v.id} voice={v} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              Cancelar
            </button>
          </DialogClose>
          {showSave && (
            <button
              type="button"
              disabled={!selected || saving}
              onClick={handleSave}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--terracotta)] px-6 py-2.5 text-sm font-semibold text-[#0f0e0d] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saveLabel}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
