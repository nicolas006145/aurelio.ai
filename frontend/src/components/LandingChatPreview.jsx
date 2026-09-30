import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, Square, Loader2, ArrowRight, RotateCcw, Sparkles } from "lucide-react";
import { useTTS } from "@/lib/useTTS";
import { useI18n } from "@/i18n/I18nContext";
import { VoiceWave } from "@/components/VoiceWave";

const STATUE_AURELIO =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=150&q=85";
const AVATAR_LUA =
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?crop=entropy&cs=srgb&fm=jpg&w=150&q=85";

export function LandingChatPreview({ onStart }) {
  const { t } = useI18n();
  const { speak, stop, playingId, loadingId } = useTTS();
  const [persona, setPersona] = useState("aurelio"); // 'aurelio' | 'lua'
  const [step, setStep] = useState(0); // 0: typing user, 1: user1, 2: typing assistant, 3: assistant1, 4: user2 typing, 5: user2, 6: assistant2 typing, 7: assistant2
  const [hasInteracted, setHasInteracted] = useState(false);
  const scrollRef = useRef(null);

  const q1 = t("landing.chatPreview.userQuestion1");
  const a1Aurelio = t("landing.chatPreview.aurelioAnswer1");
  const a1Lua = t("landing.chatPreview.luaAnswer1");
  const q2 = t("landing.chatPreview.userQuestion2");
  const a2Aurelio = t("landing.chatPreview.aurelioAnswer2");

  const assistantReply1 = persona === "lua" ? a1Lua : a1Aurelio;
  const assistantReply2 = a2Aurelio;

  // Auto-advance sequence
  useEffect(() => {
    let timer;
    if (step === 0) {
      timer = setTimeout(() => setStep(1), 1200);
    } else if (step === 1) {
      timer = setTimeout(() => setStep(2), 1000);
    } else if (step === 2) {
      timer = setTimeout(() => setStep(3), 1800);
    } else if (step === 3 && persona === "aurelio") {
      timer = setTimeout(() => setStep(4), 4000);
    } else if (step === 4) {
      timer = setTimeout(() => setStep(5), 1400);
    } else if (step === 5) {
      timer = setTimeout(() => setStep(6), 1000);
    } else if (step === 6) {
      timer = setTimeout(() => setStep(7), 2000);
    }
    return () => clearTimeout(timer);
  }, [step, persona]);

  // Smooth scroll to bottom on step change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [step]);

  // Stop audio if persona changes
  const switchPersona = (p) => {
    setHasInteracted(true);
    stop();
    setPersona(p);
    setStep(0);
  };

  const restart = () => {
    stop();
    setStep(0);
  };

  const handleSpeak = (id, text, voiceId) => {
    if (playingId === id) {
      stop();
    } else {
      speak(id, text, { demo: true, voice_id: voiceId });
    }
  };

  const isLuaPlaying = playingId === "preview-reply-lua";
  const isAurelio1Playing = playingId === "preview-reply-1";
  const isAurelio2Playing = playingId === "preview-reply-2";

  return (
    <section className="relative z-10 max-w-4xl mx-auto px-6 md:px-12 py-12 md:py-20">
      <div className="text-center mb-8">
        <span className="eyebrow">{t("landing.chatPreview.eyebrow")}</span>
        <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] mt-3">
          {t("landing.chatPreview.title")}
        </h2>
        <p className="mt-3 text-sm md:text-base text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
          {t("landing.chatPreview.subtitle")}
        </p>

        {/* Persona toggle */}
        <div className="relative inline-flex items-center gap-1.5 p-1 mt-7 rounded-full border border-[var(--border-accent)]/60 bg-[var(--bg-card)] shadow-lg">
          {!hasInteracted && (
            <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-[var(--terracotta)] text-[#0f0e0d] px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-md flex items-center gap-1 animate-bounce">
              <Sparkles size={10} /> Alternar mentor
            </span>
          )}
          <button
            type="button"
            onClick={() => switchPersona("aurelio")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              persona === "aurelio"
                ? "bg-[var(--terracotta)] text-[#0f0e0d] shadow-sm"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <img
              src={STATUE_AURELIO}
              alt="Aurélio"
              className="w-4 h-4 rounded-full object-cover border border-black/20"
            />
            Aurélio (Estoico)
          </button>
          <button
            type="button"
            onClick={() => switchPersona("lua")}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              persona === "lua"
                ? "bg-[var(--terracotta)] text-[#0f0e0d] shadow-sm"
                : `text-[var(--text-secondary)] hover:text-[var(--text-primary)] ${!hasInteracted ? "bg-[var(--terracotta)]/10 border border-[var(--terracotta)]/40 animate-pulse" : ""}`
            }`}
          >
            <img
              src={AVATAR_LUA}
              alt="Lua"
              className="w-4 h-4 rounded-full object-cover border border-black/20"
            />
            Lua (Calorosa)
          </button>
        </div>
      </div>

      {/* Chat Window Mockup */}
      <div className="relative rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden backdrop-blur-sm">
        <div className="grain" />

        {/* Header bar */}
        <div className="relative z-10 flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] bg-[var(--bg-main)]/60">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={persona === "lua" ? AVATAR_LUA : STATUE_AURELIO}
                alt={persona === "lua" ? "Lua" : "Aurélio"}
                className="w-9 h-9 rounded-full object-cover border border-[var(--border-accent)]"
              />
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-main)]" />
            </div>
            <div>
              <div className="font-serif-display font-semibold text-[var(--text-primary)] leading-none text-base">
                {persona === "lua" ? "Lua" : "Aurélio"}
              </div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {persona === "lua" ? "Mentora de amadurecimento" : "Mentor estoico"} · Online
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={restart}
              title={t("landing.chatPreview.replay")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs text-[var(--text-muted)] border border-[var(--border)] hover:border-[var(--border-accent)] hover:text-[var(--terracotta)] transition-colors"
            >
              <RotateCcw size={12} />
              <span className="hidden sm:inline">{t("landing.chatPreview.replay")}</span>
            </button>
          </div>
        </div>

        {/* Conversation Feed */}
        <div
          ref={scrollRef}
          className="relative z-10 p-5 sm:p-6 space-y-5 max-h-[380px] overflow-y-auto"
        >
          {/* USER 1 */}
          <AnimatePresence>
            {step >= 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end"
              >
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 bg-[var(--user-bubble)] text-[var(--text-primary)] text-sm leading-relaxed border border-[var(--border)]/50">
                  {step === 0 ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                    </span>
                  ) : (
                    q1
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ASSISTANT 1 */}
          <AnimatePresence>
            {step >= 2 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-serif-display text-sm font-semibold text-[var(--terracotta)]">
                    {persona === "lua" ? "Lua" : "Aurélio"}
                  </span>
                  <span className="h-px flex-1 bg-[var(--border)]/60" />
                </div>
                <div className="max-w-[95%] text-sm leading-relaxed text-[var(--text-primary)] font-sans whitespace-pre-wrap">
                  {step === 2 ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                    </span>
                  ) : (
                    assistantReply1
                  )}
                </div>

                {step >= 3 && (
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        handleSpeak(
                          persona === "lua" ? "preview-reply-lua" : "preview-reply-1",
                          assistantReply1,
                          persona === "lua" ? "female_warm" : "male_mature"
                        )
                      }
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
                    >
                      {loadingId === (persona === "lua" ? "preview-reply-lua" : "preview-reply-1") ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (persona === "lua" ? isLuaPlaying : isAurelio1Playing) ? (
                        <>
                          <Square size={12} />
                          <VoiceWave bars={3} className="text-[var(--terracotta)]" />
                        </>
                      ) : (
                        <Volume2 size={13} />
                      )}
                      <span>
                        {(persona === "lua" ? isLuaPlaying : isAurelio1Playing)
                          ? t("landing.listening")
                          : t("landing.chatPreview.listenAnswer")}
                      </span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* USER 2 (Aurélio persona) */}
          <AnimatePresence>
            {persona === "aurelio" && step >= 4 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-end pt-2"
              >
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm px-4 py-3 bg-[var(--user-bubble)] text-[var(--text-primary)] text-sm leading-relaxed border border-[var(--border)]/50">
                  {step === 4 ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                    </span>
                  ) : (
                    q2
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ASSISTANT 2 (Aurélio persona) */}
          <AnimatePresence>
            {persona === "aurelio" && step >= 6 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="font-serif-display text-sm font-semibold text-[var(--terracotta)]">
                    Aurélio
                  </span>
                  <span className="h-px flex-1 bg-[var(--border)]/60" />
                </div>
                <div className="max-w-[95%] text-sm leading-relaxed text-[var(--text-primary)] font-sans whitespace-pre-wrap">
                  {step === 6 ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                      <span className="typing-dot h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] inline-block" />
                    </span>
                  ) : (
                    assistantReply2
                  )}
                </div>

                {step >= 7 && (
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleSpeak("preview-reply-2", assistantReply2, "male_mature")}
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
                    >
                      {loadingId === "preview-reply-2" ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : isAurelio2Playing ? (
                        <>
                          <Square size={12} />
                          <VoiceWave bars={3} className="text-[var(--terracotta)]" />
                        </>
                      ) : (
                        <Volume2 size={13} />
                      )}
                      <span>
                        {isAurelio2Playing
                          ? t("landing.listening")
                          : t("landing.chatPreview.listenAnswer")}
                      </span>
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Callout Bar */}
        <div className="relative z-10 px-5 py-4 border-t border-[var(--border)] bg-[var(--bg-main)]/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--terracotta)] font-semibold">Sem julgamentos.</span> Conversas reais e salvas no seu perfil.
          </div>
          <button
            type="button"
            onClick={onStart}
            className="flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-5 py-2.5 text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            {t("landing.chatPreview.tryChat")}
            <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}

export default LandingChatPreview;
