import { Bell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const NOTICE_CONFIG = {
  expiring_soon: {
    renderMessage: (n) => `Seu plano vence em ${n.days ?? "X"} dias.`,
    ctaLabel: "Ver planos",
    ctaPath: "/planos",
  },
  expired: {
    renderMessage: () => "Seu plano venceu. Regularize para continuar usando os benefícios.",
    ctaLabel: "Regularizar",
    ctaPath: "/planos",
  },
  canceled: {
    renderMessage: () => "Seu plano foi cancelado após 5 dias sem pagamento.",
    ctaLabel: "Verificar",
    ctaPath: "/meu-plano",
  },
  processing_payment: {
    renderMessage: () => "Seu pagamento está em processamento.",
    ctaLabel: "Renovar",
    ctaPath: "/meu-plano",
  },
};

function fallbackMessage(notice) {
  if (notice?.type === "expiring_soon" || notice?.message?.includes?.("vence em")) {
    const daysMatch = notice.message?.match?.(/(\d+)\s*dia/);
    return `Seu plano vence em ${daysMatch?.[1] ?? "X"} dias.`;
  }
  if (notice?.type === "expired" || notice?.message?.includes?.("venceu")) {
    return "Seu plano venceu. Regularize para continuar usando os benefícios.";
  }
  if (notice?.type === "canceled" || notice?.message?.includes?.("cancelado")) {
    return "Seu plano foi cancelado após 5 dias sem pagamento.";
  }
  if (notice?.type === "processing_payment" || notice?.message?.includes?.("processamento")) {
    return "Seu pagamento está em processamento.";
  }
  return notice?.message || "Atualização sobre o seu plano.";
}

function fallbackConfig(notice) {
  const msg = fallbackMessage(notice);
  if (msg.includes("vence em")) return NOTICE_CONFIG.expiring_soon;
  if (msg.includes("venceu")) return NOTICE_CONFIG.expired;
  if (msg.includes("cancelado")) return NOTICE_CONFIG.canceled;
  if (msg.includes("processamento")) return NOTICE_CONFIG.processing_payment;
  return {
    renderMessage: () => msg,
    ctaLabel: "Ver planos",
    ctaPath: "/planos",
  };
}

export function SubscriptionBell({ subscription, user }) {
  const navigate = useNavigate();
  const notices = subscription?.notices || user?.subscription?.notices || [];
  const hasUnread = notices.some((n) => !n.read);
  const sub = subscription || user?.subscription;
  const planName = sub?.plan?.name || user?.plan?.name || null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative grid place-items-center h-8 w-8 rounded-full border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--terracotta)] hover:border-[var(--border-accent)] transition-colors"
          aria-label="Notificações do plano"
          title="Notificações do plano"
        >
          <Bell size={15} />
          {hasUnread && (
            <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--bg-surface)]" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[320px] rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-0 shadow-xl"
      >
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={14} className="text-[var(--terracotta)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Avisos do plano</span>
          </div>
          {planName && (
            <span className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--terracotta)]">
              {planName}
            </span>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notices.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-[var(--text-secondary)] mb-1">Tudo certo por aqui.</p>
              <p className="text-xs text-[var(--text-muted)]">
                Sem avisos sobre o seu plano no momento.
              </p>
            </div>
          ) : (
            notices.map((notice, idx) => {
              const typeConfig = NOTICE_CONFIG[notice.type] || fallbackConfig(notice);
              const message = typeConfig.renderMessage(notice);
              return (
                <div
                  key={notice.id || idx}
                  className={`px-4 py-3 border-b last:border-b-0 border-[var(--border)] ${
                    !notice.read ? "bg-[var(--terracotta)]/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2 mb-2.5">
                    {!notice.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--terracotta)] shrink-0" />
                    )}
                    <p className={`text-sm leading-relaxed text-[var(--text-secondary)] ${!notice.read ? "text-[var(--text-primary)]" : ""}`}>
                      {message}
                    </p>
                  </div>
                  <div className="flex justify-end pl-3.5">
                    <button
                      type="button"
                      onClick={() => navigate(typeConfig.ctaPath)}
                      className="rounded-full border border-[var(--border-accent)] text-[var(--terracotta)] px-3.5 py-1.5 text-xs font-medium hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-colors"
                    >
                      {typeConfig.ctaLabel}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={() => navigate("/meu-plano")}
            className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--terracotta)] transition-colors"
          >
            Gerenciar meu plano →
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default SubscriptionBell;
