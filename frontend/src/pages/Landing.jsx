import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Volume2, Loader2, ArrowRight, Anchor, Compass, Flame, Shield, Square } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ThemeToggle, useTheme } from "@/components/ThemeToggle";
import { useTTS } from "@/lib/useTTS";
import { useI18n } from "@/i18n/I18nContext";
import { LanguageSelector } from "@/components/LanguageSelector";
import { VoiceWave } from "@/components/VoiceWave";
import { LandingChatPreview } from "@/components/LandingChatPreview";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=900&q=85";
const STATUE2 =
  "https://images.unsplash.com/photo-1548811579-017cf2a4268b?crop=entropy&cs=srgb&fm=jpg&w=900&q=85";

export default function Landing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggle } = useTheme();
  const { speak, playingId, loadingId } = useTTS();
  const { t, language } = useI18n();

  const start = () => navigate(user ? "/chat" : "/auth");

  const DEMO_LINE = t("landing.demoLine");

  const PILLARS = [
    { icon: Shield, titleKey: "landing.pillars.responsibility.title", textKey: "landing.pillars.responsibility.text" },
    { icon: Anchor, titleKey: "landing.pillars.acceptance.title", textKey: "landing.pillars.acceptance.text" },
    { icon: Flame, titleKey: "landing.pillars.action.title", textKey: "landing.pillars.action.text" },
    { icon: Compass, titleKey: "landing.pillars.selfControl.title", textKey: "landing.pillars.selfControl.text" },
  ];

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] overflow-x-hidden">
      <div className="grain" />

      <nav className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <div className="font-serif-display text-2xl font-bold tracking-tight text-[var(--text-primary)]">
          {t("landing.brand")}<span className="text-[var(--terracotta)]">.</span>
        </div>
        <div className="flex items-center gap-4">
          <LanguageSelector />
          <ThemeToggle theme={theme} toggle={toggle} />
          <button
            onClick={start}
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--terracotta)] transition-colors"
          >
            {user ? t("landing.goToChat") : t("landing.enter")}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-10 md:pt-20 grid md:grid-cols-[1.2fr_1fr] gap-12 items-center">
        <div>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="eyebrow mb-6"
          >
            {t("landing.eyebrow")}
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-serif-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] text-[var(--text-primary)]"
          >
            {t("landing.heroTitle1")}
            <span className="italic text-[var(--terracotta)]"> {t("landing.heroTitle2")} </span>
            {t("landing.heroTitle3")}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl"
          >
            {t("landing.heroDescription")}
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <button
              data-testid="landing-hero-cta"
              onClick={start}
              className="group flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-7 py-3.5 font-semibold hover:gap-3 transition-all"
            >
              {t("landing.startConversation")}
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
            <button
              data-testid="landing-voice-demo-button"
              onClick={() => speak("demo", DEMO_LINE, { demo: true })}
              className="flex items-center gap-2.5 rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] px-6 py-3.5 font-medium hover:bg-[var(--terracotta)]/10 transition-colors"
            >
              {loadingId === "demo" ? (
                <Loader2 size={18} className="animate-spin" />
              ) : playingId === "demo" ? (
                <>
                  <Square size={15} />
                  <VoiceWave bars={4} className="text-[var(--terracotta)]" />
                </>
              ) : (
                <Volume2 size={18} />
              )}
              <span>{playingId === "demo" ? t("landing.listening") : t("landing.hearVoice")}</span>
            </button>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.7 }}
          className="relative"
        >
          <div className="absolute -inset-4 bg-[var(--terracotta)]/10 blur-3xl rounded-full" />
          <img
            src={STATUE}
            alt="Busto estoico"
            className="relative rounded-2xl w-full object-cover aspect-[3/4] border border-[var(--border)] grayscale-[0.15]"
          />
        </motion.div>
      </section>

      {/* CHAT PREVIEW DEMO */}
      <LandingChatPreview onStart={start} />

      {/* MANIFESTO */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 md:px-12 py-16 md:py-24 text-center">
        <span className="eyebrow">{t("landing.manifesto")}</span>
        <blockquote className="font-serif-display text-3xl sm:text-4xl lg:text-5xl leading-[1.2] mt-6 text-[var(--text-primary)]">
          {t("landing.manifestoQuote")}
        </blockquote>
        <p className="mt-6 text-[var(--text-secondary)] font-serif-display text-base md:text-lg tracking-wide italic font-medium">
          {t("landing.manifestoAuthor")}
        </p>
      </section>

      {/* PILLARS */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pb-8 md:pb-12">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((p, i) => (
            <motion.div
              key={p.titleKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6 hover:border-[var(--border-accent)] transition-colors"
            >
              <p.icon size={22} className="text-[var(--terracotta)]" />
              <h3 className="font-serif-display text-2xl font-semibold mt-4 text-[var(--text-primary)]">
                {t(p.titleKey)}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                {t(p.textKey)}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA + IMAGE */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 md:px-12 pt-4 pb-20 md:pb-24 grid md:grid-cols-2 gap-10 items-center">
        <img
          src={STATUE2}
          alt="Estátua clássica"
          className="rounded-2xl w-full object-cover aspect-[4/3] border border-[var(--border)] grayscale-[0.2]"
        />
        <div>
          <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[var(--text-primary)] leading-tight">
            {t("landing.ctaTitle")}
          </h2>
          <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
            {t("landing.ctaDescription")}
          </p>
          <button
            data-testid="landing-final-cta"
            onClick={start}
            className="group mt-7 flex items-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-7 py-3.5 font-semibold hover:gap-3 transition-all"
          >
            {t("landing.finalCtaButton")}
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--border)] py-8 text-center text-xs text-[var(--text-muted)]">
        {t("landing.footer")}
      </footer>
    </div>
  );
}
