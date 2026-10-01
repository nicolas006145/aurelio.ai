import { useEffect, useState, useCallback, useMemo } from "react";
import { Volume2, Loader2, Check, Lock, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { VoiceWave } from "@/components/VoiceWave";
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
import { useI18n, getCurrentLanguage } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { formatDateBR } from "@/lib/utils";

export function VoiceSettingsDialog({
  open,
  onOpenChange,
  selectedVoiceId,
  onSave,
  saveLabel,
  title,
  description,
  showSave = true,
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, subscription } = useAuth();
  const { speak, stop, playingId, loadingId } = useTTS();
  const [voices, setVoices] = useState([]);
  const [selected, setSelected] = useState(selectedVoiceId);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const DEMO_SAMPLE = t("voiceSettings.demoSample");
  const defaultTitle = t("voiceSettings.title");
  const defaultDescription = t("voiceSettings.description");
  const defaultSaveLabel = t("voiceSettings.saveLabel");

  useEffect(() => {
    setSelected(selectedVoiceId);
  }, [selectedVoiceId]);

  useEffect(() => {
    let mounted = true;
    if (!open) return;
    const lang = getCurrentLanguage();
    api
      .get(`/voices?lang=${lang}`)
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
    [speak, DEMO_SAMPLE]
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

  const activeSub = subscription?.subscription || subscription || user?.subscription;
  const userPlanId = activeSub?.plan_id || activeSub?.plan?.id || "free";
  const userPlanName =
    activeSub?.plan_name ||
    (userPlanId === "mentor"
      ? "Aurélio Mentor"
      : userPlanId === "founder"
      ? "Aurélio Fundador"
      : t("common.free"));

  const availableVoices = useMemo(() => voices.filter((v) => v.allowed), [voices]);
  const lockedVoices = useMemo(() => voices.filter((v) => !v.allowed), [voices]);

  function VoiceCard({ voice }) {
    const isSelected = selected === voice.id;
    const isPlaying = playingId === `demo-${voice.id}`;
    const isLoading = loadingId === `demo-${voice.id}`;
    const isAllowed = Boolean(voice.allowed);
    const inGrace = Boolean(voice.in_grace);

    const handleCardClick = () => {
      if (isAllowed) {
        setSelected(voice.id);
      } else {
        const planRequiredName =
          voice.required_plan === "mentor" ? "Aurélio Mentor" : "Aurélio Fundador";
        toast.info(
          t("voiceSettings.lockedNotice", {
            name: voice.persona_name || voice.label,
            planRequired: planRequiredName,
          }),
          {
            action: {
              label: t("voiceSettings.viewPlans"),
              onClick: () => {
                stop();
                onOpenChange?.(false);
                navigate("/planos");
              },
            },
          }
        );
      }
    };

    return (
      <div
        onClick={handleCardClick}
        className={`relative w-full text-left rounded-2xl border p-4 transition-all cursor-pointer ${
          isSelected
            ? "border-[var(--terracotta)] bg-[var(--terracotta)]/10 shadow-sm"
            : isAllowed
            ? "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-accent)]"
            : "border-[var(--border)]/70 bg-[var(--bg-card)]/50 hover:border-[var(--terracotta)]/50"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-serif-display text-lg font-semibold text-[var(--text-primary)]">
                {voice.label}
              </span>
              {isSelected && <Check size={16} className="text-[var(--terracotta)] shrink-0" />}

              {!isAllowed && (
                <span
                  className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    voice.required_plan === "mentor"
                      ? "bg-[var(--terracotta)] text-[#0f0e0d]"
                      : "bg-[var(--terracotta)]/15 text-[var(--terracotta)] border border-[var(--terracotta)]/30"
                  }`}
                >
                  <Lock size={10} />
                  {voice.required_plan === "mentor"
                    ? t("voiceSettings.exclusiveMentor")
                    : t("voiceSettings.exclusiveFounder")}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
              {voice.description}
            </p>

            {inGrace && (
              <div className="mt-2.5 text-[11px] text-amber-400/90 flex items-center gap-1.5 font-medium bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg w-fit">
                <Sparkles size={12} className="shrink-0" />
                <span>
                  {t("voiceSettings.graceNotice", {
                    date: formatDateBR(voice.grace_until || user?.persona_grace_until),
                  })}
                </span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isPlaying) stop();
              else playDemo(voice);
            }}
            className="grid place-items-center h-10 w-10 shrink-0 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-colors"
            aria-label={isPlaying ? t("voiceSettings.stopDemo") : t("voiceSettings.hearDemo")}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : isPlaying ? (
              <VoiceWave bars={3} className="text-[var(--terracotta)]" />
            ) : (
              <Volume2 size={16} />
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { stop(); onOpenChange?.(v); }}>
      <DialogContent className="max-w-xl !bg-[var(--bg-main)] !border-[var(--border)] text-[var(--text-primary)]">
        <DialogHeader>
          <DialogTitle className="font-serif-display text-2xl">{title || defaultTitle}</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            {description || defaultDescription}
          </DialogDescription>
        </DialogHeader>

        {loaded && voices.length > 0 && (
          <div className="mt-1 mb-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/80 px-4 py-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Sparkles size={14} className="text-[var(--terracotta)] shrink-0" />
              <span>
                {t("voiceSettings.planSummary", {
                  planName: userPlanName,
                  availableCount: availableVoices.length,
                  totalCount: voices.length,
                })}
              </span>
            </div>
            {lockedVoices.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  stop();
                  onOpenChange?.(false);
                  navigate("/planos");
                }}
                className="text-[var(--terracotta)] font-semibold hover:underline shrink-0 ml-2"
              >
                {t("voiceSettings.viewPlans")} →
              </button>
            )}
          </div>
        )}

        <div className="max-h-[60vh] overflow-y-auto pr-1">
          {!loaded ? (
            <div className="py-12 grid place-items-center text-[var(--text-muted)]">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group 1: Available in user plan */}
              {availableVoices.length > 0 && (
                <div className="space-y-3">
                  {lockedVoices.length > 0 && (
                    <div className="flex items-center gap-2 px-1">
                      <span className="eyebrow">{t("voiceSettings.availableInPlan")}</span>
                      <span className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                  )}
                  <div className="grid gap-3">
                    {availableVoices.map((v) => (
                      <VoiceCard key={v.id} voice={v} />
                    ))}
                  </div>
                </div>
              )}

              {/* Group 2: Locked / Exclusive to higher plans */}
              {lockedVoices.length > 0 && (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2 px-1">
                    <span className="eyebrow text-[var(--terracotta)]">{t("voiceSettings.exclusiveHigherPlans")}</span>
                    <span className="h-px flex-1 bg-[var(--border)]" />
                  </div>
                  <div className="grid gap-3">
                    {lockedVoices.map((v) => (
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
              {t("voiceSettings.cancel")}
            </button>
          </DialogClose>
          {showSave && (
            <button
              type="button"
              disabled={!selected || saving || (voices.find((v) => v.id === selected) && !voices.find((v) => v.id === selected)?.allowed)}
              onClick={handleSave}
              className="flex items-center justify-center gap-2 rounded-full bg-[var(--terracotta)] px-6 py-2.5 text-sm font-semibold text-[#0f0e0d] hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving && <Loader2 size={15} className="animate-spin" />}
              {saveLabel || defaultSaveLabel}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
