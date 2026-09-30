import { useState, useMemo } from "react";
import { Check, Sparkles, Star, ArrowLeft, Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import CheckoutModal from "@/components/CheckoutModal";
import { useAuth } from "@/context/AuthContext";
import { formatCurrencyBRL } from "@/lib/utils";
import { useI18n } from "@/i18n/I18nContext";

const STATUE =
  "https://images.unsplash.com/photo-1601887389937-0b02c26b602c?crop=entropy&cs=srgb&fm=jpg&w=400&q=80";

const PLAN_ICONS = {
  founder: Sparkles,
  mentor: Crown,
  free: null,
};

function PlanCard({ plan, onSelect, t }) {
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
            <span className="text-sm text-[var(--text-muted)]">{t("plans.planCard.perMonth")}</span>
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
  const { t, translateArray } = useI18n();
  const { user } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const PRICE_MAP = { free: 0, founder: 7.9, mentor: 19.9 };

  const PLANS = useMemo(() => {
    return ["free", "founder", "mentor"].map((id) => {
      const meta = t(`plans.plans.${id}`);
      const features = translateArray(`plans.plans.${id}.features`);
      const priceMonth = PRICE_MAP[id];
      const isCurrentFree = user && (!user.subscription?.plan_id || user.subscription?.plan_id === "free" || user.plan?.id === "free");
      return {
        id,
        name: meta.name,
        priceMonth,
        highlight: id === "founder",
        icon: PLAN_ICONS[id],
        eyebrow: meta.eyebrow,
        description: meta.description,
        badge: id === "founder" ? t("plans.planCard.specialBadge") : null,
        features,
        cta: id === "free"
          ? t("plans.planCard.yourPlan")
          : `${t("plans.planCard.signFor")} ${formatCurrencyBRL(priceMonth)}`,
        ctaDisabled: id === "free" && isCurrentFree,
        ctaPrimary: id === "founder",
      };
    });
  }, [t, translateArray, user]);

  const handleSelect = (plan) => {
    if (plan.ctaDisabled) return;
    if (plan.id === "free") return;
    if (!user) {
      toast.info(t("plans.loginToSubscribe"));
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
            <ArrowLeft size={16} /> {t("app.goBack")}
          </button>
          <button
            onClick={() => navigate("/")}
            className="font-serif-display text-2xl font-semibold text-[var(--text-primary)] hover:text-[var(--terracotta)] transition-colors"
          >
            {t("app.loading")}
          </button>
        </div>

        <div className="max-w-[720px] mx-auto text-center mb-12 md:mb-16">
          <span className="eyebrow text-[var(--terracotta)] mb-5 inline-block">{t("plans.pageTitle")}</span>
          <h1 className="font-serif-display text-4xl md:text-[56px] leading-[1.05] text-[var(--text-primary)] mb-6">
            {t("plans.heading1")} <em className="text-[var(--terracotta)] not-italic font-serif-display">{t("plans.heading2")}</em>{t("plans.heading3")}
          </h1>
          <p className="text-lg text-[var(--text-secondary)] leading-relaxed">
            {t("plans.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6 items-stretch">
          {PLANS.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onSelect={handleSelect} t={t} />
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
              <div className="eyebrow text-[var(--text-muted)] mb-2">{t("plans.quickNote")}</div>
              <h3 className="font-serif-display text-2xl text-[var(--text-primary)] mb-3">
                {t("plans.bestPlan")}
              </h3>
              <p className="text-[var(--text-secondary)] leading-relaxed mb-3">
                {t("plans.bestPlanDesc1")}
              </p>
              <p className="text-[var(--text-secondary)] leading-relaxed">
                {t("plans.bestPlanDesc2")}
              </p>
            </div>
          </div>
        </div>

        <footer className="mt-14 md:mt-20 text-center pb-4">
          <p className="text-xs text-[var(--text-muted)]">
            {t("plans.footerNote", { year: new Date().getFullYear() })}
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
