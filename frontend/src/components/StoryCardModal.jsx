import { useState, useRef } from "react";
import { Download, Copy, Check, X, Sparkles, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useI18n } from "@/i18n/I18nContext";

export function StoryCardModal({ open, onClose, text, author = "Aurélio", date = "" }) {
  const { t } = useI18n();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardPreviewRef = useRef(null);

  if (!open || !text) return null;

  const displayDate = date
    ? new Date(date).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });

  const renderCanvas = async () => {
    const width = 1080;
    const height = 1920;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");

    // 1. Background deep obsidian gradient
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.85);
    bgGrad.addColorStop(0, "#1d1915");
    bgGrad.addColorStop(0.6, "#12100e");
    bgGrad.addColorStop(1, "#0a0908");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Subtle decorative border
    ctx.strokeStyle = "rgba(201, 122, 62, 0.28)";
    ctx.lineWidth = 3;
    ctx.strokeRect(60, 60, width - 120, height - 120);

    // Inner subtle border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    ctx.strokeRect(80, 80, width - 160, height - 160);

    // Corner accents
    const corners = [
      [60, 60],
      [width - 60, 60],
      [60, height - 60],
      [width - 60, height - 60],
    ];
    ctx.fillStyle = "#c97a3e";
    corners.forEach(([cx, cy]) => {
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 3. Top Brand header
    ctx.textAlign = "center";
    ctx.fillStyle = "#c97a3e";
    ctx.font = "bold 44px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText("AURÉLIO.", width / 2, 220);

    ctx.fillStyle = "#857c72";
    ctx.font = "600 20px 'Manrope', -apple-system, sans-serif";
    ctx.letterSpacing = "6px";
    ctx.fillText("VERDADE · DISCIPLINA · AUTOCONTROLE", width / 2, 275);

    // Decorative quote mark
    ctx.fillStyle = "rgba(201, 122, 62, 0.2)";
    ctx.font = "italic 160px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText("“", width / 2, 540);

    // 4. Main Quote Text (multiline wrapping)
    ctx.fillStyle = "#f2ede4";
    ctx.font = "italic 52px 'Cormorant Garamond', Georgia, serif";
    ctx.textAlign = "center";

    const maxWidth = width - 280;
    const words = text.replace(/[\n\r]+/g, " ").split(" ");
    let line = "";
    const lines = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());

    const lineHeight = 80;
    const totalTextHeight = lines.length * lineHeight;
    let startY = height / 2 - totalTextHeight / 2 + 60;

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], width / 2, startY + i * lineHeight);
    }

    // 5. Author attribution
    const authorY = startY + lines.length * lineHeight + 80;
    ctx.fillStyle = "#dfa262";
    ctx.font = "italic 36px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(`— ${author}`, width / 2, authorY);

    // 6. Bottom metadata
    ctx.fillStyle = "#6e665d";
    ctx.font = "22px 'Manrope', -apple-system, sans-serif";
    ctx.fillText(displayDate, width / 2, height - 240);

    ctx.fillStyle = "#c97a3e";
    ctx.font = "bold 24px 'Manrope', -apple-system, sans-serif";
    ctx.fillText("aurelio.ai", width / 2, height - 190);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png", 0.95);
    });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await renderCanvas();
      if (!blob) throw new Error("blob failed");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aurelio-stories-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Card baixado com sucesso!");
    } catch {
      toast.error("Não foi possível gerar a imagem.");
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      const blob = await renderCanvas();
      if (!blob) throw new Error("blob failed");
      if (navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        toast.success(t("storyCard.copiedImage"));
        setTimeout(() => setCopied(false), 2000);
      } else {
        toast.info(t("storyCard.copyImageError"));
      }
    } catch {
      toast.error(t("storyCard.copyImageError"));
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-[var(--bg-overlay)] backdrop-blur-md px-4 py-6 overflow-y-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-2xl flex flex-col items-center"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            aria-label={t("storyCard.close")}
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-1.5 text-[var(--terracotta)] mb-1">
            <Sparkles size={14} />
            <span className="eyebrow">{t("storyCard.title")}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] text-center mb-4">
            {t("storyCard.subtitle")}
          </p>

          {/* Card Preview in 9:16 Aspect */}
          <div
            ref={cardPreviewRef}
            className="relative w-full aspect-[9/16] rounded-2xl border border-[var(--border-accent)]/40 p-6 flex flex-col justify-between text-center shadow-lg overflow-hidden bg-gradient-to-b from-[#1c1815] via-[#12100e] to-[#0a0908]"
          >
            <div className="grain" />

            {/* Top header */}
            <div className="relative z-10 pt-2">
              <div className="font-serif-display text-xl font-bold tracking-wider text-[var(--terracotta)]">
                AURÉLIO<span className="text-[#f2ede4]">.</span>
              </div>
              <div className="text-[8px] tracking-[0.25em] text-[var(--text-muted)] uppercase mt-0.5">
                {t("storyCard.brandFooter")}
              </div>
            </div>

            {/* Quote content */}
            <div className="relative z-10 px-2 my-auto">
              <span className="font-serif-display text-4xl text-[var(--terracotta)]/40 leading-none select-none block -mb-2">
                “
              </span>
              <p className="font-serif-display italic text-lg sm:text-xl text-[var(--text-primary)] leading-snug">
                {text}
              </p>
              <p className="font-serif-display italic text-sm text-[var(--amber)] mt-3">
                — {author}
              </p>
            </div>

            {/* Bottom tag */}
            <div className="relative z-10 pb-2">
              <p className="text-[10px] text-[var(--text-muted)] tracking-wider">
                {displayDate}
              </p>
              <p className="text-[10px] font-semibold text-[var(--terracotta)] mt-0.5">
                aurelio.ai
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-5 w-full flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] py-3 text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {downloading ? t("storyCard.downloading") : t("storyCard.downloadButton")}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="w-full flex items-center justify-center gap-2 rounded-full border border-[var(--border)] text-[var(--text-secondary)] py-2.5 text-xs font-medium hover:border-[var(--border-accent)] hover:text-[var(--text-primary)] transition-colors"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? t("storyCard.copiedImage") : t("storyCard.copyImage")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default StoryCardModal;
