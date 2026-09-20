import { useState } from "react";
import { Check, Sparkles, Star, ArrowLeft, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CheckoutModal from "@/components/CheckoutModal";
import { useAuth } from "@/context/AuthContext";
import { formatCurrencyBRL } from "@/lib/utils";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    priceMonth: 0,
    highlight: false,
    icon: null,
    eyebrow: "Para começar",
    description: "Tudo o que você precisa para provar a verdade e começar a amadurecer.",
    features: [
      "10 mensagens por dia",
      "Conversas salvas",
      "Diário de reflexões básico",
      "Reflexão diária",
      "Login com Google",
      "Acesso ao chat principal",
    ],
    cta: "Seu plano atual",
    ctaDisabled: true,
  },
  {
    id: "founder",
    name: "Aurélio Fundador",
    priceMonth: 7.9,
    highlight: true,
    icon: Sparkles,
    eyebrow: "Para os primeiros",
    description: "Preço de fundador para quem entra agora. Tudo que você precisa para um ano de crescimento real.",
    badge: "Preço especial",
    features: [
      "80 mensagens por dia",
      "Histórico completo de conversas",
      "Diário de reflexões ilimitado",
      "Reflexões diárias personalizadas",
      "Organização por temas",
      "Voz do Aurélio com limite mensal",
      "Acesso antecipado a melhorias",
      "Preço especial para os primeiros usuários",
    ],
    cta: "Assinar por R$ 7,90",
    ctaPrimary: true,
  },
  {
    id: "mentor",
    name: "Aurélio Mentor",
    priceMonth: 19.9,
    highlight: false,
    icon: Crown,
    eyebrow: "Para mergulhar fundo",
    description: "A experiência completa. Mais memória, mais voz, respostas mais profundas e prioridade em tudo.",
    features: [
      "250 mensagens por dia",
      "Tudo do plano Fundador",
      "Voz do Aurélio com limite maior",
      "Memória mais completa das conversas",
      "Respostas mais detalhadas e direcionadas",
      "Revisão de metas e hábitos",
      "Prioridade nas respostas",
      "Novos recursos primeiro",
    ],
    cta: "Assinar por R$ 19,90",
  },
];

function PlanCard({ plan, onSelect }) {
  const Icon = plan.icon;
  return (
    <div
      data-testid={`plan-card-${plan.id}`}
      className={`relative flex flex-col rounded-3xl border p-7 transition-all ${
        plan.highlight
          ? "border-[var(--terracotta)] bg-[var(--terracotta)]/5 shadow-[0_0_0_1px_var(--terracotta),0_30px_80px_-20px_rgba(196,111,57,0.25)] md:-mt-4 md:mb-4"
          : "border-[var(--border)] bg-[var(--bg-card)] hover:border-[var(--border-accent)]"
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] px-3 py-1 text-[11px] uppercase tracking-[0.18em] font-semibold whitespace-nowrap shadow-lg">
          <span className="inline-flex items-center gap-1.5">
            <Star size={11} /> {plan.badge}
          </span>
        </div>
      )}

      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--text-muted)] mb-2 flex items-center gap-2">
          {Icon && <Icon size={12} className="text-[var(--terracotta)]" />}
          {plan.eyebrow}
        </div>
        <div className="font-serif-display text-[26px] leading-tight text-[var(--text-primary)]">
          {plan.name}
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {plan.description}
        </p>
      </div>

      <div className="mb-6 border-b border-[var(--border)] pb-5">
        <div className="flex items-baseline gap-2">
          <span className="font-serif-display text-4xl text-[var(--text-primary)]">
            {formatCurrencyBRL(plan.priceMonth)}
          </span>
          {plan.priceMonth > 0 && (
            <span className="text-sm text-[var(--text-muted)]">/mês</span>
          )}
        </div>
      </div>

      <ul className="space-y-3 mb-7 flex-1">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-3 text-[14px] text-[var(--text-secondary)]">
            <div className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-[var(--terracotta)]/15 grid place-items-center text-[var(--terracotta)]">
              <Check size={12} />
            </div>
            <span>{feat}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() => onSelect(plan)}
        disabled={plan.ctaDisabled}
        className={`w-full rounded-full py-3 px-5 text-sm font-semibold transition-all ${
          plan.ctaDisabled
            ? "border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed"
            : plan.ctaPrimary
              ? "bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] shadow-lg shadow-[var(--terracotta)]/20"
              : "border border-[var(--border-accent)] text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d]"
        }`}
      >
        {plan.cta}
      </button>
    </div>
  );
}

export default function PricingPlans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const handleSelect = (plan) => {
    if (plan.ctaDisabled) return;
    if (plan.id === "free") return;
    if (!user) {
      toast.info("Faça login para assinar um plano.");
      navigate("/auth");
      return;
    }
    setSelectedPlan(plan);
    setCheckoutOpen(true);
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-[1200px] px-6 md:px-10 py-10 md:py-16">
        <div className="flex items-center justify-between mb-10 md:mb-16">
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

        <div className="max-w-[720px] mx-auto text-center mb-12 md:mb-16">
          <span className="eyebrow text-[var(--terracotta)] mb-5 inline-block">Planos de assinatura</span>
          <h1 className="font-serif-display text-4xl md:text-[56px] leading-[1.05] text-[var(--text-primary)] mb-6">
            Crescer de verdade <em className="text-[var(--terracotta)] not-italic font-serif-display">tem preço</em>, mas não é caro.
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
            Escolha o plano que combina com a sua intensidade. Todos dão acesso ao que importa — a verdade que você precisa ouvir.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onSelect={handleSelect} />
          ))}
        </div>

        <div className="mt-16 md:mt-24 max-w-[720px] mx-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-8 md:p-10">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="shrink-0">
              <img
                src={STATUE}
                alt=""
                className="h-20 w-20 rounded-2xl object-cover border border-[var(--border-accent)]"
              />
            </div>
            <div className="flex-1">
              <div className="eyebrow text-[var(--text-muted)] mb-2">Uma nota rápida</div>
              <h3 className="font-serif-display text-2xl text-[var(--text-primary)] mb-3">
                O melhor plano é o que você usa.
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                Começar pelo gratuito já é um passo maior do que a maioria das pessoas dá. Quando você perceber que o Aurélio virou parte do seu dia — aí faz sentido subir.
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                E o preço de fundador? É para quem está aqui desde o começo e quer garantir o mesmo valor, para sempre.
              </p>
            </div>
          </div>
        </div>

        <footer className="mt-14 md:mt-20 text-center pb-4">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Aurélio. Valorizando a verdade, sem bajulação.
          </p>
        </footer>
      </div>

      <CheckoutModal
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        plan={selectedPlan}
        user={user}
      />
    </div>
  );
}

export { PricingPlans };
