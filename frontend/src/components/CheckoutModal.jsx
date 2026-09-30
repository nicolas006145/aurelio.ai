import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, CreditCard, Copy, ChevronLeft, Loader2, QrCode, Shield } from "lucide-react";
import { toast } from "sonner";
import { paymentsApi, formatApiErrorDetail } from "@/lib/api";
import { formatCurrencyBRL } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import { useI18n, getCurrentLanguage } from "@/i18n/I18nContext";

function applyCpfMask(value) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function applyCepMask(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

function applyCardNumberMask(value) {
  const digits = value.replace(/\D/g, "").slice(0, 16);
  const groups = digits.match(/.{1,4}/g) || [];
  return groups.join(" ");
}

function applyCardExpiryMask(value) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function applyCvvMask(value) {
  return value.replace(/\D/g, "").slice(0, 4);
}

export default function CheckoutModal({ open, onOpenChange, plan, user }) {
  const { refreshSubscription } = useAuth();
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const [payerName, setPayerName] = useState("");
  const [cpf, setCpf] = useState("");
  const [cpfError, setCpfError] = useState("");
  const [cpfValidated, setCpfValidated] = useState(false);
  const [email, setEmail] = useState("");
  const [cep, setCep] = useState("");
  const [cepError, setCepError] = useState("");
  const [cepValidated, setCepValidated] = useState(false);
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");

  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardHolder, setCardHolder] = useState("");

  const [pixQrCode, setPixQrCode] = useState("");
  const [pixCopyPaste, setPixCopyPaste] = useState("");
  const [paymentId, setPaymentId] = useState(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setPaymentMethod("pix");
      setProcessing(false);
      setConfirming(false);
      setPayerName("");
      setCpf("");
      setCpfError("");
      setCpfValidated(false);
      setEmail(user?.email || "");
      setCep("");
      setCepError("");
      setCepValidated(false);
      setStreet("");
      setNumber("");
      setComplement("");
      setNeighborhood("");
      setCity("");
      setUf("");
      setCardNumber("");
      setCardExpiry("");
      setCardCvv("");
      setCardHolder("");
      setPixQrCode("");
      setPixCopyPaste("");
      setPaymentId(null);
    }
  }, [open, user]);

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const validateCpfOnBlur = async () => {
    const clean = cpf.replace(/\D/g, "");
    if (clean.length !== 11) {
      setCpfError(t("checkout.cpfInvalid"));
      setCpfValidated(false);
      return;
    }
    try {
      setCpfError("");
      await paymentsApi.validateCpf(clean);
      setCpfValidated(true);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || t("checkout.cpfInvalid");
      setCpfError(msg);
      setCpfValidated(false);
    }
  };

  const lookupCepOnBlur = async () => {
    const clean = cep.replace(/\D/g, "");
    if (clean.length !== 8) {
      setCepError(t("checkout.cepInvalid"));
      setCepValidated(false);
      return;
    }
    try {
      setCepError("");
      const { data } = await paymentsApi.lookupCep(clean);
      setStreet(data.street || data.logradouro || "");
      setNeighborhood(data.neighborhood || data.bairro || "");
      setCity(data.city || data.localidade || "");
      setUf(data.uf || data.state || "");
      setCepValidated(true);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || t("checkout.cepInvalid");
      setCepError(msg);
      setCepValidated(false);
    }
  };

  const canAdvanceFromStep3 = () => {
    if (!payerName.trim()) return false;
    if (!cpfValidated) return false;
    if (!email.trim() || !email.includes("@")) return false;
    if (!cepValidated) return false;
    if (!street.trim() || !neighborhood.trim() || !city.trim() || !uf.trim()) return false;
    if (!number.trim()) return false;
    return true;
  };

  const canAdvanceFromStep4 = () => {
    if (paymentMethod === "pix") return true;
    if (paymentMethod === "card") {
      if (cardNumber.replace(/\s/g, "").length < 13) return false;
      if (cardExpiry.length < 5) return false;
      if (cardCvv.length < 3) return false;
      if (!cardHolder.trim()) return false;
      return true;
    }
    return false;
  };

  const handleNextStep2 = () => {
    setStep(2);
  };

  const handleNextStep3 = () => {
    setStep(3);
  };

  const handleNextStep4 = async () => {
    if (!canAdvanceFromStep3()) return;
    if (paymentMethod === "pix") {
      setStep(4);
      await initPixPayment();
    } else {
      setStep(4);
    }
  };

  const initPixPayment = async () => {
    try {
      setProcessing(true);
      const cleanCpf = cpf.replace(/\D/g, "");
      const cleanCep = cep.replace(/\D/g, "");
      const { data } = await paymentsApi.init({
        plan_id: plan?.id,
        payment_method: "pix",
        payer: {
          name: payerName,
          cpf: cleanCpf,
          email,
        },
        address: {
          cep: cleanCep,
          street,
          number,
          complement,
          neighborhood,
          city,
          uf,
        },
      });
      setPixQrCode(data.qr_code_base64 || "");
      setPixCopyPaste(data.copy_paste || "");
      setPaymentId(data.payment_id || null);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || t("checkout.initPaymentError");
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handlePixConfirm = async () => {
    try {
      setConfirming(true);
      await paymentsApi.confirm(paymentId || undefined);
      toast.success(t("checkout.paymentConfirmed"));
      await refreshSubscription();
      onOpenChange(false);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || t("checkout.confirmPending");
      toast.error(msg);
    } finally {
      setConfirming(false);
    }
  };

  const handleCardPay = async () => {
    if (!canAdvanceFromStep4()) return;
    try {
      setProcessing(true);
      const cleanCpf = cpf.replace(/\D/g, "");
      const cleanCep = cep.replace(/\D/g, "");
      const { data } = await paymentsApi.init({
        plan_id: plan?.id,
        payment_method: "card",
        card_token: "mock-card-token",
        payer: {
          name: payerName,
          cpf: cleanCpf,
          email,
        },
        address: {
          cep: cleanCep,
          street,
          number,
          complement,
          neighborhood,
          city,
          uf,
        },
        card: {
          last4: cardNumber.replace(/\s/g, "").slice(-4),
          holder_name: cardHolder,
        },
      });
      if (data.payment_id) {
        try {
          await paymentsApi.confirm(data.payment_id);
        } catch {
        }
      }
      toast.success(t("checkout.paymentApproved"));
      await refreshSubscription();
      onOpenChange(false);
    } catch (err) {
      const msg = formatApiErrorDetail(err?.response?.data?.detail) || t("checkout.processPaymentError");
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyPix = async () => {
    if (!pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      toast.success(t("checkout.pixCopied"));
    } catch {
      toast.error(t("checkout.pixCopyError"));
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3, 4].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full grid place-items-center text-xs font-semibold border ${
              step >= s
                ? "border-[var(--terracotta)] bg-[var(--terracotta)] text-[#0f0e0d]"
                : "border-[var(--border)] text-[var(--text-muted)] bg-[var(--bg-card)]"
            }`}
          >
            {step > s ? <Check size={14} /> : s}
          </div>
          {s < 4 && (
            <div
              className={`h-0.5 w-6 ${
                step > s ? "bg-[var(--terracotta)]" : "bg-[var(--border)]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[92vh] overflow-y-auto bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] rounded-3xl p-0">
        <div className="p-6 md:p-8">
          <DialogHeader className="mb-5 text-left">
            <DialogTitle className="font-serif-display text-2xl md:text-3xl text-[var(--text-primary)]">
              {t("checkout.subscribe", { plan: plan?.name || "" })}
            </DialogTitle>
            <DialogDescription className="text-[var(--text-secondary)]">
              {t("checkout.stepsHint")}
            </DialogDescription>
          </DialogHeader>

          {renderStepIndicator()}

          {step === 1 && (
            <div className="space-y-5 fadeup">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="eyebrow text-[var(--terracotta)] mb-1">{plan?.eyebrow}</div>
                    <div className="font-serif-display text-2xl text-[var(--text-primary)]">{plan?.name}</div>
                    <p className="text-[13px] text-[var(--text-secondary)] mt-1">{plan?.description}</p>
                  </div>
                  <div className="text-right">
                    <div className="font-serif-display text-3xl text-[var(--text-primary)]">
                      {formatCurrencyBRL(plan?.priceMonth)}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{t("checkout.perMonth")}</div>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-4 mt-2 grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                  {plan?.features?.slice(0, 6).map((f) => (
                    <div key={f} className="flex items-center gap-2 text-[var(--text-secondary)]">
                      <Check size={14} className="text-[var(--terracotta)] shrink-0" />
                      <span className="text-[13px]">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => onOpenChange(false)}
                  className="flex-1 rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  onClick={handleNextStep2}
                  className="flex-1 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] text-sm h-11 font-semibold shadow-lg shadow-[var(--terracotta)]/20"
                >
                  {t("common.continue")}
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5 fadeup">
              <Label className="text-sm font-semibold text-[var(--text-primary)]">{t("checkout.choosePaymentMethod")}</Label>
              <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="grid grid-cols-2 gap-3">
                <Label
                  htmlFor="pix"
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                    paymentMethod === "pix"
                      ? "border-[var(--terracotta)] bg-[var(--terracotta)]/5 shadow-[0_0_0_1px_var(--terracotta)]"
                      : "border-[var(--border)] bg-[var(--bg-main)] hover:border-[var(--border-accent)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="pix" id="pix" className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <QrCode size={18} className="text-[var(--terracotta)]" />
                        <span className="font-semibold text-[var(--text-primary)]">Pix</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{t("checkout.pixDescription")}</p>
                    </div>
                  </div>
                </Label>
                <Label
                  htmlFor="card"
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                    paymentMethod === "card"
                      ? "border-[var(--terracotta)] bg-[var(--terracotta)]/5 shadow-[0_0_0_1px_var(--terracotta)]"
                      : "border-[var(--border)] bg-[var(--bg-main)] hover:border-[var(--border-accent)]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="card" id="card" className="mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CreditCard size={18} className="text-[var(--terracotta)]" />
                        <span className="font-semibold text-[var(--text-primary)]">{t("checkout.cardLabel")}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">{t("checkout.cardDescription")}</p>
                    </div>
                  </div>
                </Label>
              </RadioGroup>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleBack}
                  className="flex-1 rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11"
                >
                  <ChevronLeft size={16} /> {t("common.back")}
                </Button>
                <Button
                  onClick={handleNextStep3}
                  className="flex-1 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] text-sm h-11 font-semibold shadow-lg shadow-[var(--terracotta)]/20"
                >
                  {t("common.continue")}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 fadeup">
              <Label className="text-sm font-semibold text-[var(--text-primary)]">{t("checkout.payerAndAddress")}</Label>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="payerName" className="text-xs text-[var(--text-muted)]">{t("checkout.fullName")}</Label>
                  <Input
                    id="payerName"
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder={t("checkout.fullNamePlaceholder")}
                    className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cpf" className="text-xs text-[var(--text-muted)]">CPF</Label>
                    <Input
                      id="cpf"
                      value={cpf}
                      onChange={(e) => {
                        setCpf(applyCpfMask(e.target.value));
                        setCpfError("");
                        setCpfValidated(false);
                      }}
                      onBlur={validateCpfOnBlur}
                      placeholder="000.000.000-00"
                      className={`rounded-2xl h-11 bg-[var(--bg-main)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)] ${
                        cpfError ? "border-red-500/60" : "border-[var(--border)]"
                      }`}
                    />
                    {cpfError && <p className="text-xs text-red-400">{cpfError}</p>}
                    {cpfValidated && !cpfError && (
                      <p className="text-xs text-[var(--terracotta)] flex items-center gap-1">
                        <Check size={12} /> {t("checkout.cpfValid")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="emailPayer" className="text-xs text-[var(--text-muted)]">E-mail</Label>
                    <Input
                      id="emailPayer"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-1 space-y-1.5">
                    <Label htmlFor="cep" className="text-xs text-[var(--text-muted)]">CEP</Label>
                    <Input
                      id="cep"
                      value={cep}
                      onChange={(e) => {
                        setCep(applyCepMask(e.target.value));
                        setCepError("");
                        setCepValidated(false);
                      }}
                      onBlur={lookupCepOnBlur}
                      placeholder="00000-000"
                      className={`rounded-2xl h-11 bg-[var(--bg-main)] border text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)] ${
                        cepError ? "border-red-500/60" : "border-[var(--border)]"
                      }`}
                    />
                    {cepError && <p className="text-xs text-red-400">{cepError}</p>}
                    {cepValidated && !cepError && (
                      <p className="text-xs text-[var(--terracotta)] flex items-center gap-1">
                        <Check size={12} /> {t("checkout.cepFound")}
                      </p>
                    )}
                  </div>
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="street" className="text-xs text-[var(--text-muted)]">{t("checkout.street")}</Label>
                    <Input
                      id="street"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder={t("checkout.streetPlaceholder")}
                      className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="number" className="text-xs text-[var(--text-muted)]">{t("checkout.number")}</Label>
                    <Input
                      id="number"
                      value={number}
                      onChange={(e) => setNumber(e.target.value)}
                      placeholder="123"
                      className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="complement" className="text-xs text-[var(--text-muted)]">{t("checkout.complement")}</Label>
                    <Input
                      id="complement"
                      value={complement}
                      onChange={(e) => setComplement(e.target.value)}
                      placeholder={t("checkout.complementPlaceholder")}
                      className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="neighborhood" className="text-xs text-[var(--text-muted)]">{t("checkout.neighborhood")}</Label>
                    <Input
                      id="neighborhood"
                      value={neighborhood}
                      onChange={(e) => setNeighborhood(e.target.value)}
                      placeholder={t("checkout.neighborhood")}
                      className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="city" className="text-xs text-[var(--text-muted)]">{t("checkout.city")}</Label>
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder={t("checkout.city")}
                        className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="uf" className="text-xs text-[var(--text-muted)]">UF</Label>
                      <Input
                        id="uf"
                        value={uf}
                        onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                        placeholder="SP"
                        className="rounded-2xl h-11 bg-[var(--bg-main)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleBack}
                  className="flex-1 rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11"
                >
                  <ChevronLeft size={16} /> {t("common.back")}
                </Button>
                <Button
                  onClick={handleNextStep4}
                  disabled={!canAdvanceFromStep3() || processing}
                  className="flex-1 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] text-sm h-11 font-semibold shadow-lg shadow-[var(--terracotta)]/20 disabled:opacity-50"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : paymentMethod === "pix" ? t("checkout.generatePix") : t("common.continue")}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && paymentMethod === "pix" && (
            <div className="space-y-5 fadeup">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6 text-center">
                <div className="eyebrow text-[var(--terracotta)] mb-3">{t("checkout.pixPayment")}</div>
                <div className="font-serif-display text-xl text-[var(--text-primary)] mb-2">
                  {formatCurrencyBRL(plan?.priceMonth)}
                </div>
                <p className="text-xs text-[var(--text-muted)] mb-5">
                  {t("checkout.pixInstructions")}
                </p>
                {processing ? (
                  <div className="py-10 grid place-items-center">
                    <Loader2 size={32} className="animate-spin text-[var(--terracotta)]" />
                    <p className="text-sm text-[var(--text-muted)] mt-3">{t("checkout.generatingQr")}</p>
                  </div>
                ) : pixQrCode ? (
                  <div className="space-y-5">
                    <div className="bg-white p-3 rounded-2xl inline-block shadow-lg">
                      <img
                        src={`data:image/png;base64,${pixQrCode}`}
                        alt="QR Code Pix"
                        className="h-48 w-48 object-contain"
                      />
                    </div>
                    <div className="space-y-2 text-left">
                      <Label className="text-xs text-[var(--text-muted)]">{t("checkout.pixCopyLabel")}</Label>
                      <Textarea
                        readOnly
                        value={pixCopyPaste}
                        rows={3}
                        className="rounded-2xl bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] text-xs font-mono-jb resize-none"
                      />
                      <Button
                        onClick={handleCopyPix}
                        className="w-full rounded-full border border-[var(--border)] bg-transparent text-[var(--terracotta)] hover:bg-[var(--terracotta)] hover:text-[#0f0e0d] text-sm h-10"
                      >
                        <Copy size={14} /> {t("checkout.copyPixCode")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-400">{t("checkout.qrError")}</p>
                )}
              </div>
              <div className="rounded-2xl border border-[var(--terracotta)]/30 bg-[var(--terracotta)]/5 p-4 flex gap-3">
                <Shield size={18} className="text-[var(--terracotta)] shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-primary)]">{t("checkout.notice")}:</strong> {t("checkout.pixDelayNotice")}
                </p>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleBack}
                  className="flex-1 rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11"
                >
                  <ChevronLeft size={16} /> {t("common.back")}
                </Button>
                <Button
                  onClick={handlePixConfirm}
                  disabled={!pixQrCode || confirming}
                  className="flex-1 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] text-sm h-11 font-semibold shadow-lg shadow-[var(--terracotta)]/20 disabled:opacity-50"
                >
                  {confirming ? <Loader2 size={16} className="animate-spin" /> : t("checkout.iPaid")}
                </Button>
              </div>
            </div>
          )}

          {step === 4 && paymentMethod === "card" && (
            <div className="space-y-5 fadeup">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-6">
                <div className="flex items-center gap-2 mb-5">
                  <CreditCard size={18} className="text-[var(--terracotta)]" />
                  <span className="font-semibold text-[var(--text-primary)]">{t("checkout.cardData")}</span>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cardNumber" className="text-xs text-[var(--text-muted)]">{t("checkout.cardNumber")}</Label>
                    <Input
                      id="cardNumber"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(applyCardNumberMask(e.target.value))}
                      placeholder="**** **** **** 4242"
                      className="rounded-2xl h-11 bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cardExpiry" className="text-xs text-[var(--text-muted)]">{t("checkout.cardExpiry")}</Label>
                      <Input
                        id="cardExpiry"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(applyCardExpiryMask(e.target.value))}
                        placeholder="MM/AA"
                        className="rounded-2xl h-11 bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cardCvv" className="text-xs text-[var(--text-muted)]">CVV</Label>
                      <Input
                        id="cardCvv"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(applyCvvMask(e.target.value))}
                        placeholder="123"
                        className="rounded-2xl h-11 bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cardHolder" className="text-xs text-[var(--text-muted)]">{t("checkout.cardHolder")}</Label>
                    <Input
                      id="cardHolder"
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                      placeholder="COMO ESTÁ NO CARTÃO"
                      className="rounded-2xl h-11 bg-[var(--bg-card)] border-[var(--border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--terracotta)]"
                    />
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--terracotta)]/30 bg-[var(--terracotta)]/5 p-4 flex gap-3">
                <Shield size={18} className="text-[var(--terracotta)] shrink-0 mt-0.5" />
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong className="text-[var(--text-primary)]">{t("checkout.demoEnv")}:</strong> {t("checkout.demoEnvNotice")}
                </p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-main)] p-5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-[var(--text-muted)]">{t("checkout.total")}</div>
                  <div className="font-serif-display text-2xl text-[var(--text-primary)]">
                    {formatCurrencyBRL(plan?.priceMonth)}
                    <span className="text-sm text-[var(--text-muted)] font-sans"> {t("checkout.perMonth")}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleBack}
                  className="flex-1 rounded-full border border-[var(--border)] bg-transparent text-[var(--text-secondary)] hover:bg-[var(--border)]/20 text-sm h-11"
                >
                  <ChevronLeft size={16} /> {t("common.back")}
                </Button>
                <Button
                  onClick={handleCardPay}
                  disabled={!canAdvanceFromStep4() || processing}
                  className="flex-1 rounded-full bg-[var(--terracotta)] text-[#0f0e0d] hover:bg-[var(--terracotta-hover)] text-sm h-11 font-semibold shadow-lg shadow-[var(--terracotta)]/20 disabled:opacity-50"
                >
                  {processing ? <Loader2 size={16} className="animate-spin" /> : t("checkout.payAmount", { amount: formatCurrencyBRL(plan?.priceMonth) })}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { CheckoutModal };
