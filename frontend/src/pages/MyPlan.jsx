import { useState } from "react";
import { ArrowLeft, Check, Crown, Sparkles, AlertCircle, Loader2, Calendar, CreditCard, Mail, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { subscriptionApi, formatApiErrorDetail } from "@/lib/api";
import { formatCurrencyBRL, formatDateBR, maskEmail } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getPlanMeta(planId) {
  switch (planId) {
    case "founder":
      return {
        name: "Aurélio Fundador",
        icon: Sparkles,
        eyebrow: "Para os primeiros",
        highlight: true,
        description: "Preço de fundador para quem entra agora.",
      };
    case "mentor":
      return {
        name: "Aurélio Mentor",
        icon: Crown,
        eyebrow: "Para mergulhar fundo",
        highlight: false,
        description: "A experiência completa.",
      };
    case "free":
    default:
      return {
        name: "Gratuito",
        icon: null,
        eyebrow: "Para começar",
        highlight: false,
        description: "Tudo o que você precisa para provar a verdade.",
      };
  }
}

function getStatusBadge(status) {
  switch (status) {
    case "active":
    case "ativo":
      return {
        label: "Ativo",
        className:
          "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      };
    case "past_due":
    case "inadimplente":
      return {
        label: "Pagamento pendente",
        className:
          "bg-amber-500/15 text-amber-400 border-amber-500/30",
      };
    case "canceled":
    case "cancelado":
      return {
        label: "Cancelado",
        className:
          "bg-red-500/15 text-red-400 border-red-500/30",
      };
    default:
      return {
        label: status || "Sem assinatura",
        className:
          "bg-[var(--border)]/50 text-[var(--text-muted)] border-[var(--border)]",
      };
  }
}

export default function MyPlan() {
  const navigate = useNavigate();
  const { user, subscription, refreshSubscription } = useAuth();
  const [canceling, setCanceling] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);

  const planId = subscription?.plan_id || subscription?.plan?.id || "free";
  const planMeta = getPlanMeta(planId);
  const Icon = planMeta.icon;
  const price = subscription?.amount || subscription?.price_month || (planId === "founder" ? 7.9 : planId === "mentor" ? 19.9 : 0);
  const statusBadge = getStatusBadge(subscription?.status);
  const isActive = subscription?.status === "active" || subscription?.status === "ativo";

  const handleCancel = async () => {
    try {
      setCanceling(true);
      await subscriptionApi.cancel();
      toast.success("Assinatura cancelada com sucesso. Você manterá o acesso até o final do período atual.");
      await refreshSubscription();
      setCancelDialogOpen(false);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || "Não foi possível cancelar a assinatura.";
      toast.error(msg);
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[960px] px-6 md:px-10 py-10 md:py-16">
        <div className="flex items-center justify-between mb-10 md:mb-14">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--terracotta)] transition-colors"
          >
            <ArrowLeft size={16} /> Voltar
          </button>
          <button
            onClick={() => navigate("/")}
            className="font-serif-display text-2xl font-semibold text-[var(--text-primary)] hover:text-[var(--terracotta)] transition-colors"
          >
            Aurélio.
          </button>
        </div>

        <div className="max-w-[640px] mx-auto mb-10 md:mb-12">
          <span className="eyebrow text-[var(--terracotta)] mb-4 inline-block">Minha assinatura</span>
          <h1 className="font-serif-display text-4xl md:text-5xl leading-[1.05] text-[var(--text-primary)] mb-4">
            Acompanhe seu <em className="text-[var(--terracotta)] not-italic font-serif-display">plano</em>.
          </h1>
          <p className="text-base md:text-lg text-[var(--text-secondary)] leading-relaxed">
            Aqui você vê detalhes da sua assinatura, método de pagamento e pode mudar ou cancelar quando quiser.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5 md:gap-6 mb-8">
          <div className="md:col-span-3 rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-7 md:p-8">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2 flex items-center gap-2">
                  {Icon && <Icon size={12} className="text-[var(--terracotta)]" />}
                  {planMeta.eyebrow}
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="font-serif-display text-3xl text-[var(--text-primary)]">
                    {planMeta.name}
                  </h2>
                  <span
                    className={`text-[11px] uppercase tracking-[0.18em] font-semibold px-3 py-1 rounded-full border ${statusBadge.className}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">{planMeta.description}</p>
              </div>
            </div>

            <div className="border-t border-[var(--border)] pt-5 mt-5 mb-6">
              <div className="flex items-baseline gap-2">
                <span className="font-serif-display text-5xl text-[var(--text-primary)]">
                  {formatCurrencyBRL(price)}
                </span>
                {price > 0 && <span className="text-sm text-[var(--text-muted)]">/mês</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-7">
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Início</div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Calendar size={14} className="text-[var(--terracotta)]" />
                  {formatDateBR(subscription?.started_at || subscription?.created_at) || "—"}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)]">Próxima cobrança</div>
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <CreditCard size={14} className="text-[var(--terracotta)]" />
                  {isActive ? (formatDateBR(subscription?.next_billing_at || subscription?.renew_at) || "—") : "—"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => navigate("/planos")}
                className="w-full rounded-full py-3 px-5 text-sm font-semibold border border-[var(--border-accent)] text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] transition-all"
              >
                Mudar de plano
              </button>
              <button
                onClick={() => setCancelDialogOpen(true)}
                disabled={!isActive}
                className="w-full rounded-full py-3 px-5 text-sm font-semibold border border-[var(--border)] text-[var(--text-secondary)] hover:border-red-500/50 hover:text-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Cancelar assinatura
              </button>
            </div>
          </div>

          <div className="md:col-span-2 space-y-5">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-7">
              <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">Sua conta</div>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--terracotta)]/15 grid place-items-center text-[var(--terracotta)]">
                    <User size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-0.5">Nome</div>
                    <div className="text-sm text-[var(--text-primary)] truncate">{user?.name || user?.full_name || "—"}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 rounded-full bg-[var(--terracotta)]/15 grid place-items-center text-[var(--terracotta)]">
                    <Mail size={15} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-0.5">E-mail</div>
                    <div className="text-sm text-[var(--text-primary)] truncate">{maskEmail(user?.email) || "—"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--terracotta)]/30 bg-[var(--terracotta)]/5 p-6">
              <div className="flex gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-[var(--terracotta)]/15 grid place-items-center text-[var(--terracotta)]">
                  <Check size={17} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)] mb-1">
                    Você pode cancelar quando quiser.
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                    Não há multa, fidelidade ou pegadinha. Se cancelar, mantém o acesso até o final do período que já pagou.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-7 md:p-8 mb-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-4">O que está incluso</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(planId === "free"
              ? [
                  "10 mensagens por dia",
                  "Conversas salvas",
                  "Diário de reflexões básico",
                  "Reflexão diária",
                  "Login com Google",
                  "Acesso ao chat principal",
                ]
              : planId === "founder"
                ? [
                    "80 mensagens por dia",
                    "Histórico completo de conversas",
                    "Diário de reflexões ilimitado",
                    "Reflexões diárias personalizadas",
                    "Organização por temas",
                    "Voz do Aurélio com limite mensal",
                    "Acesso antecipado a melhorias",
                    "Preço especial para os primeiros usuários",
                  ]
                : [
                    "250 mensagens por dia",
                    "Tudo do plano Fundador",
                    "Voz do Aurélio com limite maior",
                    "Memória mais completa das conversas",
                    "Respostas mais detalhadas e direcionadas",
                    "Revisão de metas e hábitos",
                    "Prioridade nas respostas",
                    "Novos recursos primeiro",
                  ]
            ).map((feat) => (
              <li key={feat} className="flex items-start gap-3 text-[14px] text-[var(--text-secondary)]">
                <div className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-[var(--terracotta)]/15 grid place-items-center text-[var(--terracotta)]">
                  <Check size={12} />
                </div>
                <span>{feat}</span>
              </li>
            ))}
          </ul>
        </div>

        <footer className="mt-14 text-center pb-4">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Aurélio. Valorizando a verdade, sem bajulação.
          </p>
        </footer>
      </div>

      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent className="bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] rounded-3xl max-w-md p-6 md:p-7">
          <AlertDialogHeader className="text-left">
            <div className="h-11 w-11 rounded-full bg-red-500/15 grid place-items-center text-red-400 mb-3">
              <AlertCircle size={22} />
            </div>
            <AlertDialogTitle className="font-serif-display text-2xl text-[var(--text-primary)]">
              Cancelar assinatura?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--text-secondary)] text-sm leading-relaxed">
              Ao cancelar, sua assinatura permanecerá ativa até o final do período atual. Depois disso, você voltará automaticamente ao plano gratuito. Não há reembolso proporcional.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row sm:justify-end sm:space-x-2 gap-2 mt-5">
            <AlertDialogCancel
              disabled={canceling}
              className="rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11 mt-0 sm:mt-0"
            >
              Manter assinatura
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={canceling}
              className="rounded-full bg-red-500 text-white hover:bg-red-500/90 text-sm h-11 font-semibold disabled:opacity-50"
            >
              {canceling ? <Loader2 size={16} className="animate-spin" /> : "Confirmar cancelamento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
