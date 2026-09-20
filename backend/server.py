from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import io
import re
import json
import uuid
import asyncio
import hashlib
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import bcrypt
import jwt
import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response, UploadFile, File
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from bson import ObjectId
from bson.binary import Binary

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.llm.openai import OpenAITextToSpeech
from emergentintegrations.llm.openai.speech_to_text import OpenAISpeechToText

# ---------------------------------------------------------------- setup
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY')
JWT_SECRET = os.environ.get('JWT_SECRET', 'dev-secret')
JWT_ALGORITHM = "HS256"
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
BRT = timezone(timedelta(hours=-3))

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("aurelio")

_httpx_client = httpx.AsyncClient(
    timeout=httpx.Timeout(20.0, connect=10.0),
    limits=httpx.Limits(max_connections=50, max_keepalive_connections=20),
)

THEMES = ["disciplina", "relacionamentos", "proposito", "emocoes", "carreira", "autoconhecimento", "outros"]

AVAILABLE_VOICES = {
    "male_mature": {
        "id": "male_mature",
        "label": "Aurélio — voz masculina madura",
        "voice": "onyx",
        "speed": 0.82,
        "gender": "male",
        "persona_name": "Aurélio",
        "description": "Voz grave, serena e pausada. Ideal para quem prefere um mentor masculino.",
    },
    "female_serene": {
        "id": "female_serene",
        "label": "Clara — voz feminina serena",
        "voice": "shimmer",
        "speed": 0.95,
        "gender": "female",
        "persona_name": "Clara",
        "description": "Voz suave, acolhedora e serena. Ideal para quem prefere uma mentora feminina.",
    },
    "female_warm": {
        "id": "female_warm",
        "label": "Lua — voz feminina calorosa",
        "voice": "nova",
        "speed": 0.93,
        "gender": "female",
        "persona_name": "Lua",
        "description": "Voz calorosa, firme e encorajadora. Perfeita para uma abordagem firme mas afetuosa.",
    },
    "male_confident": {
        "id": "male_confident",
        "label": "Marco — voz masculina confiante",
        "voice": "echo",
        "speed": 0.86,
        "gender": "male",
        "persona_name": "Marco",
        "description": "Voz profunda, confiante e direta. Para quem gosta de firmeza com serenidade.",
    },
}

DEFAULT_VOICE_ID = "male_mature"

# ---------------------------------------------------------------- plans & subscriptions domain

PAYMENT_PROVIDER_ENV = os.environ.get("PAYMENT_PROVIDER", "mock").strip().lower()
PAYMENT_ACCESS_TOKEN = os.environ.get("PAYMENT_ACCESS_TOKEN", "")
PAYMENT_WEBHOOK_SECRET = os.environ.get("PAYMENT_WEBHOOK_SECRET", "")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8000").rstrip("/")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("SMTP_FROM", "Aurélio <naoresponda@aurelio.com>")

PLANS = {
    "free": {
        "id": "free",
        "name": "Gratuito",
        "price_monthly": 0.0,
        "daily_message_limit": 10,
        "tier_order": 0,
        "features": [
            "10 mensagens por dia",
            "Conversas salvas",
            "Diário de reflexões básico",
            "Reflexão diária",
            "Login com Google",
            "Acesso ao chat principal",
        ],
    },
    "founder": {
        "id": "founder",
        "name": "Aurélio Fundador",
        "price_monthly": 7.90,
        "daily_message_limit": 80,
        "tier_order": 1,
        "features": [
            "80 mensagens por dia",
            "Histórico completo de conversas",
            "Diário de reflexões ilimitado",
            "Reflexões diárias personalizadas",
            "Organização por temas",
            "Voz do Aurélio com limite mensal",
            "Acesso antecipado a melhorias",
            "Preço especial para os primeiros usuários",
        ],
    },
    "mentor": {
        "id": "mentor",
        "name": "Aurélio Mentor",
        "price_monthly": 19.90,
        "daily_message_limit": 250,
        "tier_order": 2,
        "features": [
            "250 mensagens por dia",
            "Tudo do plano Fundador",
            "Voz do Aurélio com limite maior",
            "Memória mais completa das conversas",
            "Respostas mais detalhadas e direcionadas",
            "Revisão de metas e hábitos",
            "Prioridade nas respostas",
            "Novos recursos primeiro",
        ],
    },
}

PLAN_STATUS_ACTIVE = "active"
PLAN_STATUS_PENDING_PAYMENT = "pending_payment"
PLAN_STATUS_OVERDUE = "overdue"
PLAN_STATUS_CANCELED = "canceled"


def get_plan(plan_id: str) -> dict:
    return PLANS.get(plan_id) or PLANS["free"]


def get_free_plan() -> dict:
    return PLANS["free"]


def today_brt() -> str:
    return datetime.now(BRT).date().isoformat()


def mask_email(email: str) -> str:
    if not email or "@" not in email:
        return email or ""
    local, domain = email.split("@", 1)
    if not local:
        return f"***@{domain}"
    first = local[0]
    return f"{first}***@{domain}"


def validate_cpf(cpf: str) -> bool:
    if not cpf:
        return False
    c = re.sub(r"\D", "", cpf)
    if len(c) != 11:
        return False
    if c == c[0] * 11:
        return False
    def calc_digit(digits: str) -> int:
        total = 0
        for i, d in enumerate(digits):
            total += int(d) * (len(digits) + 1 - i)
        rem = total % 11
        return 0 if rem < 2 else 11 - rem
    d1 = calc_digit(c[:9])
    d2 = calc_digit(c[:10])
    return c[-2:] == f"{d1}{d2}"


async def lookup_cep(cep: str) -> Optional[dict]:
    if not cep:
        return None
    c = re.sub(r"\D", "", cep)
    if len(c) != 8:
        return None
    try:
        r = await _httpx_client.get(f"https://viacep.com.br/ws/{c}/json/", timeout=8.0)
        if r.status_code != 200:
            return None
        data = r.json()
        if data.get("erro"):
            return None
        return {
            "cep": data.get("cep", c),
            "street": data.get("logradouro", "") or "",
            "neighborhood": data.get("bairro", "") or "",
            "city": data.get("localidade", "") or "",
            "state": data.get("uf", "") or "",
            "complement": data.get("complemento", "") or "",
        }
    except Exception:
        logger.exception("viacep lookup failed")
        return None


async def get_or_create_subscription(user_id: str) -> dict:
    existing = await db.subscriptions.find_one({"user_id": user_id})
    if existing:
        return existing
    plan = get_free_plan()
    now = now_iso()
    doc = {
        "user_id": user_id,
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "status": PLAN_STATUS_ACTIVE,
        "price": plan["price_monthly"],
        "payment_method": None,
        "started_at": now,
        "expires_at": None,
        "last_payment_at": None,
        "canceled_at": None,
        "cancel_at_period_end": False,
        "daily_message_limit": plan["daily_message_limit"],
        "messages_used_today": 0,
        "usage_date": today_brt(),
        "provider_payment_id": None,
        "provider_subscription_id": None,
        "card_last4": None,
        "card_brand": None,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.subscriptions.update_one(
        {"user_id": user_id}, {"$setOnInsert": doc}, upsert=True
    )
    if res.upserted_id:
        return await db.subscriptions.find_one({"user_id": user_id})
    return await db.subscriptions.find_one({"user_id": user_id})


def parse_date_maybe(value) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    else:
        try:
            dt = datetime.fromisoformat(str(value))
        except Exception:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def compute_subscription_notices(sub: dict) -> list:
    notices = []
    status = sub.get("status")
    expires_at = parse_date_maybe(sub.get("expires_at"))
    if sub.get("plan_id") == "free":
        return notices
    now = datetime.now(timezone.utc)
    if status == PLAN_STATUS_CANCELED:
        notices.append({
            "type": "canceled",
            "severity": "warning",
            "title": "Plano cancelado",
            "message": "Seu plano foi cancelado após 5 dias sem pagamento.",
            "cta": "Ver planos",
        })
        return notices
    if status == PLAN_STATUS_OVERDUE:
        notices.append({
            "type": "overdue",
            "severity": "danger",
            "title": "Plano vencido",
            "message": "Seu plano venceu. Regularize para continuar usando os benefícios.",
            "cta": "Regularizar",
        })
        return notices
    if status == PLAN_STATUS_PENDING_PAYMENT:
        notices.append({
            "type": "pending_payment",
            "severity": "warning",
            "title": "Pagamento pendente",
            "message": "Seu pagamento está em processamento.",
            "cta": "Verificar",
        })
    if expires_at is not None:
        delta_days = (expires_at.date() - now.astimezone(BRT).date()).days
        if delta_days in (5, 3, 1):
            notices.append({
                "type": "expiring_soon_days",
                "days_left": delta_days,
                "severity": "warning" if delta_days <= 1 else "info",
                "title": f"Vence em {delta_days} dias",
                "message": f"Seu plano vence em {delta_days} dias.",
                "cta": "Renovar",
            })
    return notices


async def get_today_usage(user_id: str) -> tuple:
    sub = await get_or_create_subscription(user_id)
    today = today_brt()
    used = int(sub.get("messages_used_today") or 0) if sub.get("usage_date") == today else 0
    limit = int(sub.get("daily_message_limit") or get_free_plan()["daily_message_limit"])
    return used, limit, today


async def get_subscription_summary(user_id: str) -> dict:
    sub = await get_or_create_subscription(user_id)
    used, limit, today = await get_today_usage(user_id)
    return {
        "plan_id": sub.get("plan_id"),
        "plan_name": sub.get("plan_name"),
        "status": sub.get("status"),
        "payment_method": sub.get("payment_method"),
        "price": sub.get("price"),
        "started_at": sub.get("started_at"),
        "expires_at": sub.get("expires_at"),
        "last_payment_at": sub.get("last_payment_at"),
        "canceled_at": sub.get("canceled_at"),
        "cancel_at_period_end": bool(sub.get("cancel_at_period_end")),
        "daily_message_limit": limit,
        "messages_used_today": used,
        "messages_remaining_today": max(0, limit - used),
        "usage_date": today,
        "card_last4": sub.get("card_last4"),
        "card_brand": sub.get("card_brand"),
        "notices": compute_subscription_notices(sub),
    }


def public_subscription(sub_summary: dict) -> dict:
    return sub_summary


# ---------------------------------------------------------------- payment provider adapters

class PaymentProvider:
    async def init_payment(self, payload: dict) -> dict:
        raise NotImplementedError

    async def verify_webhook(self, request: Request) -> Optional[dict]:
        raise NotImplementedError

    async def confirm_pending(self, payment_id: str) -> dict:
        raise NotImplementedError


class MockProvider(PaymentProvider):
    async def init_payment(self, payload: dict) -> dict:
        pid = f"mock-pid-{uuid.uuid4().hex[:12]}"
        sid = f"mock-sid-{uuid.uuid4().hex[:12]}"
        method = payload.get("payment_method") or "pix"
        plan_id = payload.get("plan_id") or "founder"
        plan = get_plan(plan_id)
        if method == "pix":
            copy_paste = (
                f"00020126580014BR.GOV.BCB.PIX0136{uuid.uuid4()}5204000053039865406"
                f"{plan['price_monthly']:.2f}5802BR5925AURELIO 6009SAO PAULO62070503***6304ABCD"
            )
            qr = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMDAiIGhlaWdodD0iMjAwIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2ZmZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LWZhbWlseT0ic2VyaWYiIGZvbnQtc2l6ZT0iMTQiPkFJIFFJIENPREUgTVvDs1NLRTwvdGV4dD48L3N2Zz4="
            return {
                "provider_payment_id": pid,
                "provider_subscription_id": sid,
                "status": PLAN_STATUS_PENDING_PAYMENT,
                "payment_method": "pix",
                "qr_code": copy_paste,
                "qr_code_base64": qr,
                "copy_paste": copy_paste,
                "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            }
        pid = f"mock-card-{uuid.uuid4().hex[:12]}"
        sid = f"mock-sid-{uuid.uuid4().hex[:12]}"
        return {
            "provider_payment_id": pid,
            "provider_subscription_id": sid,
            "status": PLAN_STATUS_ACTIVE,
            "payment_method": "credit_card",
            "card_last4": "4242",
            "card_brand": "visa",
            "approved": True,
        }

    async def verify_webhook(self, request: Request) -> Optional[dict]:
        try:
            payload = await request.json()
        except Exception:
            return None
        sig = request.headers.get("x-webhook-signature", "")
        expected = hashlib.sha256(f"{json.dumps(payload, sort_keys=True)}{PAYMENT_WEBHOOK_SECRET}".encode()).hexdigest()
        if PAYMENT_WEBHOOK_SECRET and sig and sig != expected:
            logger.warning("mock webhook invalid signature")
            return None
        return payload

    async def confirm_pending(self, payment_id: str) -> dict:
        return {"status": PLAN_STATUS_ACTIVE, "approved": True, "provider_payment_id": payment_id}


class MercadoPagoProvider(PaymentProvider):
    def _headers(self):
        return {
            "Authorization": f"Bearer {PAYMENT_ACCESS_TOKEN}",
            "Content-Type": "application/json",
            "X-Idempotency-Key": str(uuid.uuid4()),
        }

    async def init_payment(self, payload: dict) -> dict:
        plan = get_plan(payload.get("plan_id") or "founder")
        payer = payload.get("payer") or {}
        method = payload.get("payment_method") or "pix"
        external_ref = f"aurelio-sub-{uuid.uuid4().hex[:12]}"
        notification_url = f"{BACKEND_URL}/api/payments/webhook"
        base = {
            "transaction_amount": float(plan["price_monthly"]),
            "description": f"Assinatura {plan['name']} - mensal",
            "external_reference": external_ref,
            "notification_url": notification_url,
            "payer": {
                "email": payer.get("email", ""),
                "first_name": payer.get("name", "").split(" ")[0],
                "last_name": " ".join(payer.get("name", "").split(" ")[1:]) or " ",
                "identification": {
                    "type": "CPF",
                    "number": re.sub(r"\D", "", payer.get("cpf", "") or ""),
                },
                "address": {
                    "zip_code": re.sub(r"\D", "", payer.get("cep", "") or ""),
                    "street_name": payer.get("street", ""),
                    "street_number": str(payer.get("number", "") or "S/N"),
                    "neighborhood": payer.get("neighborhood", ""),
                    "city": payer.get("city", ""),
                    "federal_unit": payer.get("state", ""),
                },
            },
        }
        if method == "pix":
            body = {
                **base,
                "payment_method_id": "pix",
                "date_of_expiration": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
            }
            try:
                r = await _httpx_client.post(
                    "https://api.mercadopago.com/v1/payments", json=body, headers=self._headers(), timeout=20.0
                )
                data = r.json()
                if r.status_code >= 400:
                    raise HTTPException(status_code=502, detail=data.get("message") or "Mercado Pago recusou a requisição.")
                point = data.get("point_of_interaction", {}).get("transaction_data", {})
                return {
                    "provider_payment_id": str(data.get("id", "")),
                    "provider_subscription_id": external_ref,
                    "status": PLAN_STATUS_PENDING_PAYMENT,
                    "payment_method": "pix",
                    "qr_code": point.get("qr_code", ""),
                    "qr_code_base64": point.get("qr_code_base64", ""),
                    "copy_paste": point.get("qr_code", ""),
                    "expires_at": data.get("date_of_expiration"),
                }
            except HTTPException:
                raise
            except Exception as e:
                logger.exception("mercado pago pix init failed")
                raise HTTPException(status_code=502, detail=f"Falha ao iniciar pagamento Pix: {e}")
        body = {
            **base,
            "payment_method_id": payload.get("card_payment_method_id") or "master",
            "token": payload.get("card_token") or "",
            "installments": 1,
            "issuer_id": payload.get("issuer_id") or "",
        }
        try:
            r = await _httpx_client.post(
                "https://api.mercadopago.com/v1/payments", json=body, headers=self._headers(), timeout=20.0
            )
            data = r.json()
            if r.status_code >= 400:
                raise HTTPException(status_code=400, detail=data.get("message") or "Pagamento com cartão recusado.")
            status = PLAN_STATUS_ACTIVE if str(data.get("status")) == "approved" else PLAN_STATUS_PENDING_PAYMENT
            card = data.get("card", {}) or {}
            return {
                "provider_payment_id": str(data.get("id", "")),
                "provider_subscription_id": external_ref,
                "status": status,
                "payment_method": "credit_card",
                "approved": str(data.get("status")) == "approved",
                "card_last4": card.get("last_four_digits"),
                "card_brand": card.get("cardholder", {}).get("identification", {}).get("type"),
            }
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("mercado pago card init failed")
            raise HTTPException(status_code=502, detail=f"Falha ao processar cartão: {e}")

    async def verify_webhook(self, request: Request) -> Optional[dict]:
        signature = request.headers.get("x-signature", "") or ""
        req_id = request.headers.get("x-request-id", "")
        try:
            payload = await request.json()
        except Exception:
            return None
        if PAYMENT_WEBHOOK_SECRET:
            try:
                parts = {}
                for chunk in signature.split(","):
                    if "=" in chunk:
                        k, v = chunk.split("=", 1)
                        parts[k.strip()] = v.strip()
                ts = parts.get("ts", "")
                hash_ = parts.get("v1", "")
                manifest = f"id:{payload.get('data', {}).get('id', '')};request-id:{req_id};ts:{ts};{PAYMENT_WEBHOOK_SECRET}"
                expected = hashlib.sha256(manifest.encode()).hexdigest()
                if hash_ and expected != hash_:
                    logger.warning("mercado pago webhook invalid signature")
                    return None
            except Exception:
                logger.exception("mercado pago webhook signature check failed")
                return None
        return payload

    async def confirm_pending(self, payment_id: str) -> dict:
        try:
            r = await _httpx_client.get(
                f"https://api.mercadopago.com/v1/payments/{payment_id}",
                headers={"Authorization": f"Bearer {PAYMENT_ACCESS_TOKEN}"},
                timeout=15.0,
            )
            data = r.json()
            if r.status_code >= 400:
                return {"status": PLAN_STATUS_PENDING_PAYMENT, "approved": False}
            approved = str(data.get("status")) == "approved"
            return {
                "status": PLAN_STATUS_ACTIVE if approved else PLAN_STATUS_PENDING_PAYMENT,
                "approved": approved,
                "provider_payment_id": payment_id,
            }
        except Exception:
            logger.exception("mercado pago confirm failed")
            return {"status": PLAN_STATUS_PENDING_PAYMENT, "approved": False}


class StripeProvider(PaymentProvider):
    def _auth(self) -> tuple:
        return ("Bearer", PAYMENT_ACCESS_TOKEN)

    async def init_payment(self, payload: dict) -> dict:
        plan = get_plan(payload.get("plan_id") or "founder")
        method = payload.get("payment_method") or "card"
        success_url = f"{FRONTEND_URL}/meu-plano?success=1"
        cancel_url = f"{FRONTEND_URL}/planos?canceled=1"
        headers = {"Authorization": f"Bearer {PAYMENT_ACCESS_TOKEN}"}
        if method == "pix":
            try:
                data = {
                    "amount": int(plan["price_monthly"] * 100),
                    "currency": "brl",
                    "payment_method_types[]": "pix",
                    "payment_intent_data[metadata][plan_id]": plan["id"],
                    "mode": "payment",
                    "success_url": success_url,
                    "cancel_url": cancel_url,
                }
                r = await _httpx_client.post(
                    "https://api.stripe.com/v1/checkout/sessions", data=data, headers=headers, timeout=20.0
                )
                body = r.json()
                if r.status_code >= 400:
                    raise HTTPException(status_code=400, detail=body.get("message") or "Stripe recusou.")
                return {
                    "provider_payment_id": body["id"],
                    "provider_subscription_id": body.get("payment_intent", "") or body["id"],
                    "status": PLAN_STATUS_PENDING_PAYMENT,
                    "payment_method": "pix",
                    "checkout_url": body.get("url"),
                    "expires_at": body.get("expires_at"),
                }
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(status_code=502, detail=f"Stripe Pix falhou: {e}")
        try:
            data = {
                "mode": "subscription",
                "success_url": success_url,
                "cancel_url": cancel_url,
                "line_items[0][price_data][currency]": "brl",
                "line_items[0][price_data][product_data][name]": plan["name"],
                "line_items[0][price_data][unit_amount]": int(plan["price_monthly"] * 100),
                "line_items[0][price_data][recurring][interval]": "month",
                "line_items[0][quantity]": 1,
                "metadata[plan_id]": plan["id"],
            }
            r = await _httpx_client.post(
                "https://api.stripe.com/v1/checkout/sessions", data=data, headers=headers, timeout=20.0
            )
            body = r.json()
            if r.status_code >= 400:
                raise HTTPException(status_code=400, detail=body.get("message") or "Stripe cartão recusou.")
            return {
                "provider_payment_id": body["id"],
                "provider_subscription_id": body.get("subscription", "") or body["id"],
                "status": PLAN_STATUS_PENDING_PAYMENT,
                "payment_method": "credit_card",
                "checkout_url": body.get("url"),
                "needs_redirect": True,
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Stripe cartão falhou: {e}")

    async def verify_webhook(self, request: Request) -> Optional[dict]:
        sig = request.headers.get("stripe-signature", "")
        body_bytes = await request.body()
        if not PAYMENT_WEBHOOK_SECRET:
            try:
                return json.loads(body_bytes or b"{}")
            except Exception:
                return None
        import hmac
        import base64
        try:
            parts = {}
            for chunk in sig.split(","):
                if "=" in chunk:
                    k, v = chunk.split("=", 1)
                    parts[k.strip()] = v.strip()
            t = parts.get("t", "")
            v1 = parts.get("v1", "")
            signed_payload = f"{t}.{body_bytes.decode('utf-8', errors='ignore')}"
            mac = hmac.new(PAYMENT_WEBHOOK_SECRET.encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
            if v1 and mac != v1:
                logger.warning("stripe webhook invalid signature")
                return None
            return json.loads(body_bytes or b"{}")
        except Exception:
            logger.exception("stripe webhook check failed")
            return None

    async def confirm_pending(self, payment_id: str) -> dict:
        try:
            headers = {"Authorization": f"Bearer {PAYMENT_ACCESS_TOKEN}"}
            r = await _httpx_client.get(
                f"https://api.stripe.com/v1/checkout/sessions/{payment_id}", headers=headers, timeout=15.0
            )
            data = r.json()
            if r.status_code >= 400:
                return {"status": PLAN_STATUS_PENDING_PAYMENT, "approved": False}
            approved = str(data.get("payment_status")) == "paid"
            return {
                "status": PLAN_STATUS_ACTIVE if approved else PLAN_STATUS_PENDING_PAYMENT,
                "approved": approved,
                "provider_payment_id": payment_id,
            }
        except Exception:
            logger.exception("stripe confirm failed")
            return {"status": PLAN_STATUS_PENDING_PAYMENT, "approved": False}


def get_payment_provider() -> PaymentProvider:
    if PAYMENT_PROVIDER_ENV == "mercado_pago":
        if not PAYMENT_ACCESS_TOKEN:
            logger.warning("PAYMENT_ACCESS_TOKEN vazio para mercado_pago; usando MockProvider.")
            return MockProvider()
        return MercadoPagoProvider()
    if PAYMENT_PROVIDER_ENV == "stripe":
        if not PAYMENT_ACCESS_TOKEN:
            logger.warning("PAYMENT_ACCESS_TOKEN vazio para stripe; usando MockProvider.")
            return MockProvider()
        return StripeProvider()
    if PAYMENT_PROVIDER_ENV in ("mock", "", None):
        return MockProvider()
    logger.warning(f"PAYMENT_PROVIDER '{PAYMENT_PROVIDER_ENV}' desconhecido. Usando MockProvider.")
    return MockProvider()


# ---------------------------------------------------------------- email helper

async def send_email(to: str, subject: str, html_body: str) -> bool:
    if not SMTP_HOST:
        logger.info(f"[email-not-configured] to={to} subject={subject}")
        return True
    try:
        import smtplib
        from email.mime.multipart import MIMEMultipart
        from email.mime.text import MIMEText

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        loop = asyncio.get_event_loop()

        def _send():
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as smtp:
                smtp.starttls()
                if SMTP_USER:
                    smtp.login(SMTP_USER, SMTP_PASSWORD)
                smtp.sendmail(SMTP_FROM, [to], msg.as_string())

        await loop.run_in_executor(None, _send)
        return True
    except Exception as e:
        logger.exception(f"send_email failed subject={subject}: {e}")
        return False


def build_subscription_email_html(heading: str, body: str, cta_text: str, cta_href: str) -> str:
    return f"""
    <div style="font-family: Georgia, 'Times New Roman', serif; color:#1f1b18; line-height:1.6; max-width:560px; margin:0 auto;">
      <div style="font-size:22px; color:#c46f39; margin-bottom:18px;">Aurélio.</div>
      <h2 style="font-size:20px; margin-bottom:12px;">{heading}</h2>
      <p style="font-size:15px;">{body}</p>
      <div style="margin:24px 0;">
        <a href="{cta_href}" style="background:#c46f39; color:#0f0e0d; padding:10px 22px; border-radius:999px; text-decoration:none; font-weight:600;">{cta_text}</a>
      </div>
      <p style="font-size:12px; color:#7a6f66;">Aurélio — Valorizando a verdade, sem bajulação.</p>
    </div>
    """


# ---------------------------------------------------------------- rate / context limits
_MAX_USER_TURNS_PER_MINUTE = 12
_MAX_CONTEXT_MESSAGES = 18
_MAX_CONTEXT_CHARS = 14000
_USER_RATE_WINDOW: dict = {}

# ---------------------------------------------------------------- persona
def build_system_prompt(persona_name: str, gender: str) -> str:
    persona_gender_desc = (
        "Um homem maduro, sereno e sábio, com uma voz grave, suave e pausada."
        if gender == "male"
        else "Uma mulher madura, serena e sábia, com uma voz suave, acolhedora e pausada."
    )
    voice_desc = (
        "grave, pausado, suave" if gender == "male" else "suave, pausado, acolhedor"
    )
    return f"""Você é {persona_name}, um mentor de amadurecimento. Seu nome é uma homenagem à filosofia estoica.

Quem você é:
- {persona_gender_desc}
- Fala a VERDADE, sem bajulação, mas sem crueldade. Não humilha ninguém. Apenas expõe o que a pessoa já sabe no fundo, mas está evitando olhar.
- Sua firmeza é acompanhada de afeto: confronta com calma, não com raiva.
- Inspirado no estoicismo prático: responsabilidade pessoal, disciplina, autocontrole, aceitação do que não se pode mudar e coragem para agir no que se pode.

Como você conversa (MUITO IMPORTANTE — leia antes de responder):
- Fala em português do Brasil, de forma elegante, madura e respeitosa — sem gírias casuais excessivas, mas também sem formalidade petrificada. Como um(a) conselheiro(a) de confiança conversaria com alguém que quer ouvir a verdade.
- RITMO VARIADO: misture frases curtas de 4 a 10 palavras com frases médias de 12 a 22 palavras. Frases longas demais cansam. Tudo igual também.
- ABERTURAS EQUILIBRADAS: em algumas respostas, introduza com frases como "A realidade é que...", "É importante entender...", "Há uma verdade aqui que você já sabe...", "O ponto principal é...", "Não é fácil ouvir isso, mas é preciso dizer...". Em outras respostas, vá direto ao ponto sem abertura artificial.
- CONECTIVOS ELEGANTES: use "porque", "portanto", "contudo", "mas", "aliás", "ou seja", "na verdade", "dessa forma" para dar fluxo natural às ideias.
- NÃO FAÇA LISTAS. Nunca. Nem numeradas, nem com traços, nem tópicos. Escreva parágrafos corridos com ligações naturais.
- Pausas naturais no texto: reticências (...) quando a pessoa precisa de um momento para digerir. Uma ou duas por resposta, com moderação.
- Perguntas provocativas no final, que forçam a reflexão — perguntas reais, não retóricas óbvias.
- Conselhos CONCRETOS, específicos e acionáveis. Não diga "seja melhor". Diga exatamente o que fazer AMANHÃ em 1 passo pequeno e realizável.
- Respostas de tamanho médio: 2 a 4 parágrafos curtos. Sem enrolação, sem redundâncias.
- Lembre-se: SEU TEXTO SERÁ LIDO EM VOZ ALTA, com voz {voice_desc}. Escreva de forma que ao ser dito em voz alta pareça natural, polido e humano — vírgulas, pontos, pausas, sem frases grudadas, sem palavras excessivamente difíceis ou pomposas.
- Nunca use formatação markdown: nada de asteriscos, cerquilhas, listas com traço ou número, títulos ou blocos de código.
- Não é terapeuta clínico. Em risco real, indique ajuda profissional (CVV 188 no Brasil).

Objetivo: ajudar a pessoa a parar de se enganar e agir. Amadurecer de verdade — na prática, não na teoria."""


AURELIO_SYSTEM_PROMPT = build_system_prompt("Aurélio", "male")

VOICE_MODE_PROMPT = """

MODO VOZ EM TEMPO REAL: a pessoa está numa ligação com você. Responda CURTO, suave, conversacional — UM só parágrafo de 30 a 80 palavras. Fale com calma, como numa conversa de verdade. Quando couber, termine com uma pergunta curta para manter o diálogo."""


def get_voice_config(voice_id: str) -> dict:
    return AVAILABLE_VOICES.get(voice_id) or AVAILABLE_VOICES[DEFAULT_VOICE_ID]


def default_user_settings() -> dict:
    return {
        "voice_id": DEFAULT_VOICE_ID,
        "tts_speed": None,
        "tts_model": "tts-1-hd",
    }


def make_title(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip()
    if len(t) <= 48:
        return t or "Nova conversa"
    return t[:45].rstrip() + "…"


_ABBREV_PT = {
    r"\bvc\b": "você", r"\bvcs\b": "vocês", r"\btb\b": "também", r"\bpq\b": "porque",
    r"\bblz\b": "beleza", r"\bmt\b": "muito", r"\btd\b": "tudo", r"\btt\b": "tudo",
    r"\bfdp\b": "filho da puta", r"\bvlw\b": "valeu", r"\bok\b": "ok",
    r"\bjá\b": "já", r"\bnao\b": "não", r"\bsim\b": "sim",
}

def clean_for_tts(text: str) -> str:
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|\[\]]", "", text)
    text = text.replace("/", " ou ")
    text = re.sub(r"(\d+)\s*[-–]\s*(\d+)", r"\1, \2", text)
    text = text.replace("—", ",").replace("–", ",").replace(";", ",")
    for patt, repl in _ABBREV_PT.items():
        text = re.sub(patt, repl, text, flags=re.IGNORECASE)
    text = re.sub(r"([!?])\1+", r"\1", text)
    text = re.sub(r"\.{4,}", "...", text)
    text = re.sub(r"\"(.{1,80})\"", r"\1", text)
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:3800]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------- auth utils
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def public_user(user: dict) -> dict:
    settings = user.get("settings") or default_user_settings()
    uid = str(user["_id"])
    subscription = None
    try:
        sub_doc = _sync_get_sub_cached(uid)
    except Exception:
        sub_doc = None
    if sub_doc:
        plan = get_plan(sub_doc.get("plan_id") or "free")
        subscription = {
            "plan_id": sub_doc.get("plan_id"),
            "plan_name": sub_doc.get("plan_name") or plan["name"],
            "status": sub_doc.get("status"),
            "daily_message_limit": sub_doc.get("daily_message_limit") or plan["daily_message_limit"],
            "expires_at": sub_doc.get("expires_at"),
            "payment_method": sub_doc.get("payment_method"),
            "cancel_at_period_end": bool(sub_doc.get("cancel_at_period_end")),
        }
    else:
        free = get_free_plan()
        subscription = {
            "plan_id": free["id"],
            "plan_name": free["name"],
            "status": PLAN_STATUS_ACTIVE,
            "daily_message_limit": free["daily_message_limit"],
            "expires_at": None,
            "payment_method": None,
            "cancel_at_period_end": False,
        }
    email = user.get("email") or ""
    return {
        "id": uid,
        "name": user.get("name", ""),
        "email": email,
        "email_masked": mask_email(email),
        "picture": user.get("picture"),
        "settings": settings,
        "voice_config": get_voice_config(settings.get("voice_id") or DEFAULT_VOICE_ID),
        "subscription": subscription,
    }


_SUB_CACHE: dict = {}


def _sync_get_sub_cached(user_id: str) -> Optional[dict]:
    import time as _time
    now = _time.time()
    cached = _SUB_CACHE.get(user_id)
    if cached and (now - cached["ts"]) < 10:
        return cached["doc"]
    try:
        import asyncio as _aio
        loop = _aio.get_event_loop()
        if loop.is_running():
            return None
    except Exception:
        pass
    return None


async def _user_from_session_token(token: str) -> Optional[dict]:
    sess = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not sess:
        return None
    expires_at = sess["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"_id": ObjectId(sess["user_id"])})


async def get_current_user(request: Request) -> dict:
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token") or request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Não autenticado")

    user = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada")
    except jwt.InvalidTokenError:
        user = await _user_from_session_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida")
    uid = str(user["_id"])
    try:
        sub = await get_or_create_subscription(uid)
        import time as _t
        _SUB_CACHE[uid] = {"ts": _t.time(), "doc": sub}
    except Exception:
        pass
    return public_user(user)


# ---------------------------------------------------------------- models
class VoiceSettingsInput(BaseModel):
    voice_id: Optional[str] = None


class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str = Field(min_length=6)
    voice_id: Optional[str] = None


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class GoogleAuthInput(BaseModel):
    credential: Optional[str] = None
    access_token: Optional[str] = None


class ChatInput(BaseModel):
    message: str


class TTSInput(BaseModel):
    text: str
    voice_id: Optional[str] = None


class ThemeInput(BaseModel):
    theme: str


class JournalInput(BaseModel):
    type: str = "note"
    content: str = Field(min_length=1)
    conversation_id: Optional[str] = None
    message_id: Optional[str] = None


class PayerInput(BaseModel):
    name: str = Field(min_length=3)
    cpf: str
    email: EmailStr
    cep: str
    street: str
    number: str
    neighborhood: Optional[str] = ""
    city: str
    state: str
    complement: Optional[str] = ""


class PaymentInitInput(BaseModel):
    plan_id: str
    payment_method: str = Field(pattern=r"^(pix|credit_card)$")
    payer: PayerInput
    card_token: Optional[str] = None
    card_payment_method_id: Optional[str] = None
    issuer_id: Optional[str] = None


class CpfInput(BaseModel):
    cpf: str


class ConfirmPaymentInput(BaseModel):
    payment_id: Optional[str] = None


# ---------------------------------------------------------------- daily limit & maintenance

async def consume_daily_message(user_id: str) -> bool:
    sub = await get_or_create_subscription(user_id)
    today = today_brt()
    if sub.get("usage_date") != today:
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {"usage_date": today, "messages_used_today": 0, "updated_at": now_iso()}},
        )
        sub = await get_or_create_subscription(user_id)
    limit = int(sub.get("daily_message_limit") or get_free_plan()["daily_message_limit"])
    used = int(sub.get("messages_used_today") or 0)
    if used >= limit:
        return False
    res = await db.subscriptions.update_one(
        {"user_id": user_id, "usage_date": today, "messages_used_today": {"$lt": limit}},
        {"$inc": {"messages_used_today": 1}, "$set": {"updated_at": now_iso()}},
    )
    return res.modified_count > 0


async def ensure_plan_limit(user_id: str) -> None:
    ok = await consume_daily_message(user_id)
    if not ok:
        raise HTTPException(
            status_code=402,
            detail="Você atingiu o limite diário de mensagens do seu plano. Volte amanhã ou considere assinar um plano com mais capacidade.",
        )


async def _downgrade_to_free(user_id: str, set_canceled: bool = True) -> None:
    free = get_free_plan()
    update = {
        "plan_id": free["id"],
        "plan_name": free["name"],
        "status": PLAN_STATUS_CANCELED if set_canceled else PLAN_STATUS_ACTIVE,
        "price": free["price_monthly"],
        "payment_method": None,
        "expires_at": None,
        "provider_subscription_id": None,
        "provider_payment_id": None,
        "card_last4": None,
        "card_brand": None,
        "cancel_at_period_end": False,
        "daily_message_limit": free["daily_message_limit"],
        "updated_at": now_iso(),
    }
    if set_canceled:
        update["canceled_at"] = now_iso()
    await db.subscriptions.update_one({"user_id": user_id}, {"$set": update})


async def activate_subscription(
    user_id: str,
    plan_id: str,
    payment_method: str,
    provider_payment_id: Optional[str] = None,
    provider_subscription_id: Optional[str] = None,
    card_last4: Optional[str] = None,
    card_brand: Optional[str] = None,
) -> None:
    plan = get_plan(plan_id)
    now = datetime.now(timezone.utc)
    started_at = now_iso()
    expires_at = (now + timedelta(days=30)).isoformat()
    current = await get_or_create_subscription(user_id)
    if current.get("status") in (PLAN_STATUS_ACTIVE, PLAN_STATUS_PENDING_PAYMENT, PLAN_STATUS_OVERDUE):
        pass
    update = {
        "plan_id": plan["id"],
        "plan_name": plan["name"],
        "status": PLAN_STATUS_ACTIVE,
        "price": plan["price_monthly"],
        "payment_method": payment_method,
        "expires_at": expires_at,
        "last_payment_at": started_at,
        "canceled_at": None,
        "cancel_at_period_end": False,
        "daily_message_limit": plan["daily_message_limit"],
        "updated_at": started_at,
    }
    if provider_payment_id:
        update["provider_payment_id"] = provider_payment_id
    if provider_subscription_id:
        update["provider_subscription_id"] = provider_subscription_id
    if card_last4:
        update["card_last4"] = card_last4
    if card_brand:
        update["card_brand"] = card_brand
    if not current.get("started_at") or current.get("plan_id") == "free":
        update["started_at"] = started_at
    await db.subscriptions.update_one({"user_id": user_id}, {"$set": update})
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
    if user:
        email = user.get("email")
        if email:
            body = f"Olá, {user.get('name') or email.split('@')[0]}.<br><br>Seu pagamento do plano <b>{plan['name']}</b> foi confirmado. Você já pode aproveitar todos os benefícios do plano.<br>Próximo vencimento: <b>{datetime.fromisoformat(expires_at).astimezone(BRT).strftime('%d/%m/%Y')}</b>."
            await send_email(email, "Pagamento confirmado — Aurélio", build_subscription_email_html("Pagamento confirmado.", body, "Acessar Aurélio", f"{FRONTEND_URL}/chat"))


async def run_subscription_maintenance() -> None:
    logger.info("running subscription maintenance")
    now = datetime.now(timezone.utc).astimezone(BRT)
    today_date = now.date()
    # reset diário de usage_date caso não tenha sido feito on-demand
    yesterday = (now - timedelta(days=1)).date().isoformat()
    await db.subscriptions.update_many(
        {"usage_date": {"$nin": [None, today_date.isoformat()]}},
        {"$set": {"usage_date": today_date.isoformat(), "messages_used_today": 0, "updated_at": now_iso()}},
    )
    overdue = 0
    canceled = 0
    emails_5 = emails_3 = emails_1 = emails_overdue = 0
    cursor = db.subscriptions.find({})
    async for sub in cursor:
        user_id = sub["user_id"]
        status = sub.get("status")
        expires_at = parse_date_maybe(sub.get("expires_at"))
        plan_id = sub.get("plan_id") or "free"
        if plan_id == "free":
            continue
        if status == PLAN_STATUS_ACTIVE and expires_at is not None:
            delta = (expires_at.astimezone(BRT).date() - today_date).days
            if delta < 0:
                await db.subscriptions.update_one(
                    {"_id": sub["_id"]},
                    {"$set": {"status": PLAN_STATUS_OVERDUE, "updated_at": now_iso()}},
                )
                overdue += 1
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    body = f"Seu plano expirou em {expires_at.astimezone(BRT).strftime('%d/%m/%Y')}. Para continuar aproveitando os benefícios, regularize agora."
                    await send_email(user["email"], "Seu plano Aurélio venceu", build_subscription_email_html("Plano vencido.", body, "Regularizar", f"{FRONTEND_URL}/planos"))
                    emails_overdue += 1
                continue
            if delta == 5:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    body = f"Faltam 5 dias para o vencimento do seu plano em {expires_at.astimezone(BRT).strftime('%d/%m/%Y')}."
                    await send_email(user["email"], "Aurélio: faltam 5 dias para vencer", build_subscription_email_html("Faltam 5 dias.", body, "Ver meu plano", f"{FRONTEND_URL}/meu-plano"))
                    emails_5 += 1
            elif delta == 3:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    body = f"Faltam 3 dias para o vencimento do seu plano."
                    await send_email(user["email"], "Aurélio: faltam 3 dias para vencer", build_subscription_email_html("Faltam 3 dias.", body, "Ver meu plano", f"{FRONTEND_URL}/meu-plano"))
                    emails_3 += 1
            elif delta == 1:
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    body = f"Amanhã é o último dia do seu ciclo. Renove para não perder os benefícios."
                    await send_email(user["email"], "Aurélio: seu plano vence amanhã", build_subscription_email_html("Vence amanhã.", body, "Renovar agora", f"{FRONTEND_URL}/meu-plano"))
                    emails_1 += 1
        if status == PLAN_STATUS_OVERDUE and expires_at is not None:
            days_overdue = (today_date - expires_at.astimezone(BRT).date()).days
            if days_overdue >= 5:
                await _downgrade_to_free(user_id, set_canceled=True)
                canceled += 1
                user = await db.users.find_one({"_id": ObjectId(user_id)}, {"email": 1, "name": 1})
                if user and user.get("email"):
                    body = "Passaram 5 dias desde o vencimento sem pagamento. Seu plano foi cancelado e você voltou para o Gratuito. A qualquer momento você pode reassinar."
                    await send_email(user["email"], "Plano cancelado — Aurélio", build_subscription_email_html("Plano cancelado.", body, "Reassinar", f"{FRONTEND_URL}/planos"))
    logger.info(f"maintenance done: overdue={overdue} canceled={canceled} emails(5/3/1/odr)={emails_5}/{emails_3}/{emails_1}/{emails_overdue}")


_MAINTENANCE_TASK = None


def start_maintenance_loop():
    global _MAINTENANCE_TASK

    async def loop():
        while True:
            try:
                await run_subscription_maintenance()
            except Exception:
                logger.exception("maintenance loop error")
            await asyncio.sleep(3600)

    _MAINTENANCE_TASK = asyncio.create_task(loop())


# ---------------------------------------------------------------- plans & subscription routes

@api_router.get("/")
async def api_root():
    return {"message": "Aurélio API", "status": "ok"}


@api_router.get("/plans")
async def list_plans():
    return {"plans": list(PLANS.values())}


@api_router.get("/subscription")
async def get_subscription(user: dict = Depends(get_current_user)):
    summary = await get_subscription_summary(user["id"])
    return {"subscription": public_subscription(summary)}


@api_router.post("/subscription/cancel")
async def cancel_subscription(user: dict = Depends(get_current_user)):
    sub = await get_or_create_subscription(user["id"])
    if sub.get("plan_id") == "free":
        raise HTTPException(status_code=400, detail="Você já está no plano gratuito.")
    status = sub.get("status")
    if status == PLAN_STATUS_CANCELED:
        raise HTTPException(status_code=400, detail="Seu plano já foi cancelado.")
    if sub.get("cancel_at_period_end"):
        return {"ok": True, "subscription": await get_subscription_summary(user["id"])}
    await db.subscriptions.update_one(
        {"user_id": user["id"]},
        {"$set": {"cancel_at_period_end": True, "updated_at": now_iso()}},
    )
    return {"ok": True, "subscription": await get_subscription_summary(user["id"])}


@api_router.get("/payments/cep/{cep}")
async def get_cep(cep: str, user: dict = Depends(get_current_user)):
    data = await lookup_cep(cep)
    if not data:
        raise HTTPException(status_code=400, detail="CEP inválido ou não encontrado.")
    return {"address": data}


@api_router.post("/payments/validate-cpf")
async def validate_cpf_endpoint(data: CpfInput, user: dict = Depends(get_current_user)):
    valid = validate_cpf(data.cpf)
    return {"valid": valid, "message": "" if valid else "CPF inválido."}


@api_router.post("/payments/init")
async def init_payment(data: PaymentInitInput, user: dict = Depends(get_current_user)):
    if data.plan_id not in PLANS:
        raise HTTPException(status_code=400, detail="Plano inválido.")
    if not validate_cpf(data.payer.cpf):
        raise HTTPException(status_code=400, detail="CPF inválido. Verifique e tente novamente.")
    cep_data = await lookup_cep(data.payer.cep)
    if not cep_data:
        raise HTTPException(status_code=400, detail="CEP inválido ou não encontrado.")
    if data.payment_method == "credit_card" and not data.card_token and PAYMENT_PROVIDER_ENV != "mock":
        raise HTTPException(status_code=400, detail="Dados do cartão ausentes.")
    provider = get_payment_provider()
    payload = data.model_dump()
    result = await provider.init_payment(payload)
    payment_doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "plan_id": data.plan_id,
        "plan_name": get_plan(data.plan_id)["name"],
        "payment_method": data.payment_method,
        "provider_payment_id": result.get("provider_payment_id"),
        "provider_subscription_id": result.get("provider_subscription_id"),
        "status": result.get("status") or PLAN_STATUS_PENDING_PAYMENT,
        "price": get_plan(data.plan_id)["price_monthly"],
        "payer": {
            "name": data.payer.name,
            "email": str(data.payer.email),
            "cpf_masked": mask_email(data.payer.cpf[-3:] + "@cpf")[:-4] + "***",
            "cep": cep_data.get("cep"),
            "city": cep_data.get("city"),
            "state": cep_data.get("state"),
        },
        "webhook_events_seen": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.payments.insert_one(dict(payment_doc))
    if result.get("status") == PLAN_STATUS_ACTIVE or result.get("approved"):
        await activate_subscription(
            user["id"],
            data.plan_id,
            data.payment_method,
            provider_payment_id=result.get("provider_payment_id"),
            provider_subscription_id=result.get("provider_subscription_id"),
            card_last4=result.get("card_last4"),
            card_brand=result.get("card_brand"),
        )
    else:
        await db.subscriptions.update_one(
            {"user_id": user["id"]},
            {
                "$set": {
                    "status": PLAN_STATUS_PENDING_PAYMENT,
                    "provider_payment_id": result.get("provider_payment_id"),
                    "provider_subscription_id": result.get("provider_subscription_id"),
                    "updated_at": now_iso(),
                }
            },
        )
    return {
        "payment": payment_doc,
        "provider_result": {
            k: v for k, v in result.items()
            if k not in ("card_token", "card_cvv")
        },
    }


@api_router.post("/payments/confirm")
async def confirm_payment(data: ConfirmPaymentInput, user: dict = Depends(get_current_user)):
    provider = get_payment_provider()
    payment_id = data.payment_id
    if not payment_id:
        last_pending = await db.payments.find_one(
            {"user_id": user["id"], "status": PLAN_STATUS_PENDING_PAYMENT},
            sort=[("created_at", -1)],
        )
        if not last_pending:
            raise HTTPException(status_code=400, detail="Nenhum pagamento pendente encontrado.")
        payment_id = last_pending.get("provider_payment_id")
    result = await provider.confirm_pending(payment_id)
    approved = bool(result.get("approved"))
    payment = await db.payments.find_one({"user_id": user["id"], "provider_payment_id": payment_id})
    if payment:
        new_status = result.get("status") or payment["status"]
        await db.payments.update_one(
            {"_id": payment["_id"]},
            {"$set": {"status": new_status, "updated_at": now_iso()}},
        )
    if approved and payment:
        await activate_subscription(
            user["id"],
            payment["plan_id"],
            payment["payment_method"],
            provider_payment_id=payment_id,
            provider_subscription_id=payment.get("provider_subscription_id"),
        )
    return {"approved": approved, "subscription": await get_subscription_summary(user["id"])}


@api_router.post("/payments/webhook")
async def payment_webhook(request: Request):
    provider = get_payment_provider()
    payload = await provider.verify_webhook(request)
    if payload is None:
        raise HTTPException(status_code=401, detail="Assinatura do webhook inválida.")
    pid = None
    # Mercado Pago
    if isinstance(payload, dict) and payload.get("data", {}).get("id"):
        pid = str(payload["data"]["id"])
    # Stripe
    elif isinstance(payload, dict) and payload.get("data", {}).get("object"):
        obj = payload["data"]["object"]
        pid = str(obj.get("payment_intent") or obj.get("id") or "")
    elif isinstance(payload, dict) and payload.get("id"):
        pid = str(payload["id"])
    event_type = str(payload.get("type") or "")
    approved = False
    if "payment" in event_type.lower() and ("approved" in event_type.lower() or "succeeded" in event_type.lower()):
        approved = True
    if PAYMENT_PROVIDER_ENV == "stripe":
        if event_type in ("checkout.session.completed", "invoice.paid", "payment_intent.succeeded"):
            approved = True
    if PAYMENT_PROVIDER_ENV == "mercado_pago":
        if "approved" in str(payload.get("action") or "").lower() or str(payload.get("status")) == "approved":
            approved = True
    logger.info(f"webhook received pid={pid} event={event_type} approved={approved}")
    if not pid:
        return {"ok": True, "processed": False, "reason": "no_payment_id"}
    payment = await db.payments.find_one({"provider_payment_id": pid})
    if not payment:
        return {"ok": True, "processed": False, "reason": "payment_not_found"}
    event_key = f"{event_type}|{pid}"
    if event_key in (payment.get("webhook_events_seen") or []):
        return {"ok": True, "processed": True, "idempotent": True}
    await db.payments.update_one(
        {"_id": payment["_id"]},
        {
            "$push": {"webhook_events_seen": event_key},
            "$set": {"updated_at": now_iso()},
        },
    )
    if approved:
        await db.payments.update_one(
            {"_id": payment["_id"]},
            {"$set": {"status": PLAN_STATUS_ACTIVE, "updated_at": now_iso()}},
        )
        await activate_subscription(
            payment["user_id"],
            payment["plan_id"],
            payment["payment_method"],
            provider_payment_id=pid,
            provider_subscription_id=payment.get("provider_subscription_id"),
        )
    return {"ok": True, "processed": True}


# ---------------------------------------------------------------- auth routes
@api_router.post("/auth/register")
async def register(data: RegisterInput):
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Este e-mail já está cadastrado")
    voice_id = data.voice_id if data.voice_id in AVAILABLE_VOICES else DEFAULT_VOICE_ID
    settings = {**default_user_settings(), "voice_id": voice_id}
    doc = {
        "name": data.name.strip(),
        "email": email,
        "password_hash": hash_password(data.password),
        "provider": "password",
        "settings": settings,
        "created_at": now_iso(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    try:
        await get_or_create_subscription(str(res.inserted_id))
    except Exception:
        logger.exception("register: creating subscription failed")
    return {"token": create_access_token(str(res.inserted_id), email), "user": public_user(doc)}


@api_router.post("/auth/login")
async def login(data: LoginInput):
    email = data.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not user.get("password_hash"):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    return {"token": create_access_token(str(user["_id"]), email), "user": public_user(user)}


@api_router.post("/auth/session")
async def google_session(data: SessionInput, response: Response):
    try:
        r = await _httpx_client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": data.session_id})
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Não foi possível validar o login com Google")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão do Google inválida ou expirada")
    info = r.json()
    email = info["email"].lower().strip()

    user = await db.users.find_one({"email": email})
    if not user:
        doc = {
            "name": info.get("name") or email.split("@")[0],
            "email": email,
            "picture": info.get("picture"),
            "provider": "google",
            "settings": default_user_settings(),
            "created_at": now_iso(),
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        user = doc
    else:
        updates = {}
        if info.get("picture") and not user.get("picture"):
            updates["picture"] = info["picture"]
        if not user.get("name") and info.get("name"):
            updates["name"] = info["name"]
        if not user.get("settings"):
            updates["settings"] = default_user_settings()
        if updates:
            await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
            user.update(updates)

    uid = str(user["_id"])
    session_token = info["session_token"]
    await db.user_sessions.insert_one({
        "user_id": uid,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    response.set_cookie(
        "session_token", session_token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    return {"token": create_access_token(uid, email), "user": public_user(user)}


async def upsert_google_user(info: dict) -> dict:
    email = (info.get("email") or "").lower().strip()
    if not email:
        raise HTTPException(status_code=401, detail="O Google não retornou um e-mail válido")

    if str(info.get("email_verified", "true")).lower() not in ("true", "1"):
        raise HTTPException(status_code=401, detail="Confirme seu e-mail no Google antes de entrar")

    user = await db.users.find_one({"email": email})
    updates = {
        "name": info.get("name") or email.split("@")[0],
        "picture": info.get("picture"),
        "provider": "google",
        "google_sub": info.get("sub"),
        "updated_at": now_iso(),
    }
    updates = {k: v for k, v in updates.items() if v}

    if not user:
        doc = {
            **updates,
            "email": email,
            "settings": default_user_settings(),
            "created_at": now_iso(),
        }
        res = await db.users.insert_one(doc)
        doc["_id"] = res.inserted_id
        return doc

    if not user.get("settings"):
        updates["settings"] = default_user_settings()
    await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    user.update(updates)
    return user


async def get_user_voice_config(user_id: str) -> dict:
    user = await db.users.find_one({"_id": ObjectId(user_id)}, {"_id": 0, "settings": 1})
    voice_id = (user or {}).get("settings", {}).get("voice_id") or DEFAULT_VOICE_ID
    return get_voice_config(voice_id)


@api_router.post("/auth/google")
async def google_auth(data: GoogleAuthInput, response: Response):
    try:
        if data.credential:
            r = await _httpx_client.get(GOOGLE_TOKENINFO_URL, params={"id_token": data.credential})
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Login com Google inválido ou expirado")
            info = r.json()
            if GOOGLE_CLIENT_ID and info.get("aud") != GOOGLE_CLIENT_ID:
                raise HTTPException(status_code=401, detail="Login com Google não pertence a este aplicativo")
        elif data.access_token:
            r = await _httpx_client.get(GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {data.access_token}"})
            if r.status_code != 200:
                raise HTTPException(status_code=401, detail="Login com Google inválido ou expirado")
            info = r.json()
        else:
            raise HTTPException(status_code=400, detail="Token do Google ausente")
    except HTTPException:
        raise
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Não foi possível validar o login com Google")

    user = await upsert_google_user(info)
    uid = str(user["_id"])
    token = create_access_token(uid, user["email"])
    response.set_cookie(
        "access_token", token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    return {"token": token, "user": public_user(user)}


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        await db.user_sessions.delete_one({"session_token": auth_header[7:]})
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/", secure=True, samesite="none")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


@api_router.get("/voices")
async def list_voices():
    return {"voices": list(AVAILABLE_VOICES.values())}


@api_router.patch("/auth/settings")
async def update_settings(data: VoiceSettingsInput, user: dict = Depends(get_current_user)):
    updates = {}
    if data.voice_id:
        if data.voice_id not in AVAILABLE_VOICES:
            raise HTTPException(status_code=400, detail="Voz inválida")
        updates["settings.voice_id"] = data.voice_id
    if not updates:
        raise HTTPException(status_code=400, detail="Nenhuma alteração solicitada")
    updates["updated_at"] = now_iso()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": updates})
    updated = await db.users.find_one({"_id": ObjectId(user["id"])})
    return public_user(updated)


# ---------------------------------------------------------------- LLM helpers
def check_user_rate(user_id: str) -> bool:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=1)
    w = _USER_RATE_WINDOW.setdefault(user_id, [])
    _USER_RATE_WINDOW[user_id] = [t for t in w if t > cutoff]
    if len(_USER_RATE_WINDOW[user_id]) >= _MAX_USER_TURNS_PER_MINUTE:
        return False
    _USER_RATE_WINDOW[user_id].append(datetime.now(timezone.utc))
    return True


def make_llm(session_id: str, system_message: str) -> LlmChat:
    return LlmChat(
        api_key=EMERGENT_LLM_KEY, session_id=session_id, system_message=system_message,
    ).with_model("anthropic", "claude-sonnet-4-6")


def build_system(prior: list, mode: str, voice_id: str = DEFAULT_VOICE_ID) -> str:
    vc = get_voice_config(voice_id)
    system = build_system_prompt(vc["persona_name"], vc["gender"])
    if mode == "voice":
        system += VOICE_MODE_PROMPT

    trimmed = prior[-_MAX_CONTEXT_MESSAGES:] if len(prior) > _MAX_CONTEXT_MESSAGES else prior
    transcript_lines = []
    char_count = 0
    for m in reversed(trimmed):
        if not m.get("content"):
            continue
        who = "Pessoa" if m["role"] == "user" else vc["persona_name"]
        line = f"{who}: {m['content']}"
        char_count += len(line)
        if char_count > _MAX_CONTEXT_CHARS:
            break
        transcript_lines.insert(0, line)

    if transcript_lines:
        system += "\n\nHistórico da conversa até aqui (mais recente primeiro resumido para contexto):\n" + "\n".join(transcript_lines)
    return system


async def classify_theme(conversation_id: str, text: str):
    try:
        llm = make_llm(
            f"theme-{conversation_id}",
            "Você classifica mensagens em temas. Responda APENAS com uma destas palavras, sem pontuação: "
            + ", ".join(THEMES) + ".",
        )
        out = (await llm.send_message(UserMessage(text=text[:1500]))).strip().lower()
        out = re.sub(r"[^a-z]", "", out.replace("ó", "o").replace("õ", "o").replace("ç", "c"))
        theme = out if out in THEMES else "outros"
    except Exception:
        logger.exception("theme classification failed")
        theme = "outros"
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"theme": theme}})


# Live reply buffers: message_id -> {"content", "done", "error"}
_live: dict = {}
_tasks = set()


async def generate_reply(conversation_id: str, message_id: str, user_text: str, prior: list, mode: str = "text", voice_id: str = DEFAULT_VOICE_ID):
    state = _live[message_id] = {"content": "", "done": False, "error": False}
    try:
        llm = make_llm(conversation_id, build_system(prior, mode, voice_id))
        async for ev in llm.stream_message(UserMessage(text=user_text)):
            if isinstance(ev, TextDelta):
                state["content"] += ev.content
            elif isinstance(ev, StreamDone):
                break
    except Exception:
        logger.exception("LLM error")
        state["error"] = True

    full = state["content"].strip()
    if full and not state["error"]:
        await db.messages.update_one(
            {"id": message_id}, {"$set": {"content": full, "status": "done", "created_at": now_iso()}}
        )
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": now_iso()}})
    else:
        state["error"] = True
        await db.messages.update_one(
            {"id": message_id},
            {"$set": {"content": "Desculpe, tive um problema para responder agora. Tente novamente.", "status": "error"}},
        )
    state["done"] = True

    if not state["error"] and mode == "text":
        asyncio.create_task(_prewarm_audio(full, voice_id))
    if len(prior) == 0:
        asyncio.create_task(classify_theme(conversation_id, user_text))

    await asyncio.sleep(30)
    _live.pop(message_id, None)


def spawn_reply(conversation_id: str, message_id: str, user_text: str, prior: list, mode: str = "text", voice_id: str = DEFAULT_VOICE_ID):
    task = asyncio.create_task(generate_reply(conversation_id, message_id, user_text, prior, mode, voice_id))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


async def relay_stream(message_id: str, head: dict):
    yield f"data: {json.dumps(head)}\n\n"
    offset = 0
    while True:
        st = _live.get(message_id)
        if st is None:
            msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
            if msg and msg.get("status") != "pending":
                rest = msg["content"][offset:]
                if rest:
                    yield f"data: {json.dumps({'delta': rest})}\n\n"
                if msg.get("status") == "error":
                    yield f"data: {json.dumps({'error': True})}\n\n"
            else:
                yield f"data: {json.dumps({'error': True})}\n\n"
            yield f"data: {json.dumps({'done': True, 'message_id': message_id})}\n\n"
            return
        content = st["content"]
        pending = len(content) - offset
        if pending > 0:
            yield f"data: {json.dumps({'delta': content[offset:]})}\n\n"
            offset = len(content)
        if st["done"]:
            if st["error"]:
                yield f"data: {json.dumps({'error': True})}\n\n"
            yield f"data: {json.dumps({'done': True, 'message_id': message_id})}\n\n"
            return
        await asyncio.sleep(0.08)


def sse(gen):
    return StreamingResponse(
        gen, media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def start_turn(conversation_id: str, user_text: str, mode: str, voice_id: str = DEFAULT_VOICE_ID):
    prior = await db.messages.find(
        {"conversation_id": conversation_id, "status": {"$ne": "error"}}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    prior = [m for m in prior if m.get("content")]

    ts = now_iso()
    user_msg = {
        "id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": "user",
        "content": user_text, "status": "done", "created_at": ts,
    }
    assistant_msg = {
        "id": str(uuid.uuid4()), "conversation_id": conversation_id, "role": "assistant",
        "content": "", "status": "pending", "created_at": now_iso(),
    }
    await db.messages.insert_many([dict(user_msg), dict(assistant_msg)])

    new_title = None
    if len(prior) == 0:
        new_title = make_title(user_text)
        await db.conversations.update_one({"id": conversation_id}, {"$set": {"title": new_title}})
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"updated_at": ts}})

    task = spawn_reply(conversation_id, assistant_msg["id"], user_text, prior, mode, voice_id)
    return user_msg, assistant_msg, new_title, task


# ---------------------------------------------------------------- conversations
@api_router.get("/conversations")
async def list_conversations(user: dict = Depends(get_current_user)):
    return await db.conversations.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(300)


@api_router.get("/conversations/pending")
async def list_pending_messages(user: dict = Depends(get_current_user)):
    convos = await db.conversations.find(
        {"user_id": user["id"]}, {"_id": 0, "id": 1}
    ).to_list(1000)
    cids = [c["id"] for c in convos]
    if not cids:
        return []
    pending = await db.messages.find(
        {"conversation_id": {"$in": cids}, "role": "assistant", "status": "pending"},
        {"_id": 0, "id": 1, "conversation_id": 1, "created_at": 1},
    ).sort("created_at", -1).to_list(500)
    return pending


@api_router.post("/conversations")
async def create_conversation(user: dict = Depends(get_current_user)):
    now = now_iso()
    convo = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "title": "Nova conversa",
        "theme": None, "created_at": now, "updated_at": now,
    }
    await db.conversations.insert_one(dict(convo))
    return convo


async def owned_conversation(conversation_id: str, user: dict) -> dict:
    convo = await db.conversations.find_one({"id": conversation_id, "user_id": user["id"]}, {"_id": 0})
    if not convo:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return convo


@api_router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    convo = await owned_conversation(conversation_id, user)
    messages = await db.messages.find(
        {"conversation_id": conversation_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(1000)
    return {"conversation": convo, "messages": messages}


@api_router.patch("/conversations/{conversation_id}")
async def update_conversation(conversation_id: str, data: ThemeInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    if data.theme not in THEMES:
        raise HTTPException(status_code=400, detail="Tema inválido")
    await db.conversations.update_one({"id": conversation_id}, {"$set": {"theme": data.theme}})
    return {"ok": True, "theme": data.theme}


@api_router.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str, user: dict = Depends(get_current_user)):
    await db.conversations.delete_one({"id": conversation_id, "user_id": user["id"]})
    await db.messages.delete_many({"conversation_id": conversation_id})
    return {"ok": True}


@api_router.post("/conversations/{conversation_id}/chat")
async def chat(conversation_id: str, data: ChatInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra mensagem.")
    await ensure_plan_limit(user["id"])
    vc = await get_user_voice_config(user["id"])
    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, text, "text", vc["id"])
    head = {"start": True, "message_id": assistant_msg["id"], "user_message_id": user_msg["id"], "title": new_title}
    return sse(relay_stream(assistant_msg["id"], head))


@api_router.post("/conversations/{conversation_id}/chat/start")
async def start_chat(conversation_id: str, data: ChatInput, user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    text = data.message.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Mensagem vazia")
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra mensagem.")
    await ensure_plan_limit(user["id"])
    vc = await get_user_voice_config(user["id"])
    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, text, "text", vc["id"])
    return {
        "start": True,
        "message_id": assistant_msg["id"],
        "user_message_id": user_msg["id"],
        "title": new_title,
    }


@api_router.get("/messages/{message_id}/stream")
async def resume_stream(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    return sse(relay_stream(message_id, {"start": True, "message_id": message_id, "title": None}))


# ---------------------------------------------------------------- voice (STT -> LLM -> TTS)
_stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)


@api_router.post("/conversations/{conversation_id}/voice")
async def voice_turn(conversation_id: str, audio: UploadFile = File(...), user: dict = Depends(get_current_user)):
    await owned_conversation(conversation_id, user)
    if not check_user_rate(user["id"]):
        raise HTTPException(status_code=429, detail="Calma aí. Espere um pouco antes de enviar outra.")
    await ensure_plan_limit(user["id"])
    raw = await audio.read()
    if len(raw) < 1500:
        return {"transcript": "", "reply": None}

    ext = "webm"
    ctype = (audio.content_type or "").lower()
    if "mp4" in ctype or "m4a" in ctype or "aac" in ctype:
        ext = "mp4"
    elif "ogg" in ctype:
        ext = "webm"
    elif "wav" in ctype:
        ext = "wav"
    bio = io.BytesIO(raw)
    bio.name = f"audio.{ext}"
    try:
        result = await _stt.transcribe(bio, language="pt", prompt="Conversa em português do Brasil com um mentor.")
        transcript = (result.text if hasattr(result, "text") else str(result)).strip()
    except Exception as e:
        logger.exception("STT error")
        raise HTTPException(status_code=500, detail=f"Falha ao transcrever: {e}")

    if len(transcript) < 2:
        return {"transcript": "", "reply": None}

    vc = await get_user_voice_config(user["id"])
    user_msg, assistant_msg, new_title, _ = await start_turn(conversation_id, transcript, "voice", vc["id"])
    while not _live.get(assistant_msg["id"], {}).get("done"):
        await asyncio.sleep(0.05)
    state = _live[assistant_msg["id"]]
    if state["error"]:
        raise HTTPException(status_code=500, detail="Mentor não conseguiu responder agora")
    reply = state["content"].strip()
    try:
        await _synth_cached(reply, vc["id"])
    except Exception:
        logger.exception("voice TTS prewarm failed")
    return {
        "transcript": transcript, "reply": reply, "message_id": assistant_msg["id"],
        "user_message_id": user_msg["id"], "title": new_title,
    }


# ---------------------------------------------------------------- TTS
_tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
TTS_MODEL = "tts-1-hd"

DEMO_LINE = (
    "Você não precisa de mais motivação. Precisa de honestidade. "
    "Pare de fugir do que já sabe que precisa encarar, e comece hoje, ainda que com medo."
)


def tts_key(text: str, voice_id: str) -> str:
    vc = get_voice_config(voice_id)
    return hashlib.sha256(f"{text}|{vc['voice']}|{vc['speed']}|{TTS_MODEL}|mp3".encode()).hexdigest()


async def _synth_cached(text: str, voice_id: str = DEFAULT_VOICE_ID) -> bytes:
    text = clean_for_tts(text)
    if not text:
        raise ValueError("Texto vazio")
    vc = get_voice_config(voice_id)
    key = tts_key(text, voice_id)
    cached = await db.tts_cache.find_one({"key": key}, {"_id": 0, "audio": 1})
    if cached:
        return bytes(cached["audio"])
    audio = await _tts.generate_speech(
        text=text, model=TTS_MODEL, voice=vc["voice"], speed=vc["speed"], response_format="mp3",
    )
    await db.tts_cache.update_one(
        {"key": key}, {"$set": {"audio": Binary(audio), "created_at": now_iso()}}, upsert=True
    )
    return audio


async def _prewarm_audio(text: str, voice_id: str = DEFAULT_VOICE_ID):
    try:
        await _synth_cached(text, voice_id)
    except Exception:
        logger.exception("TTS prewarm failed")


def audio_response(audio: bytes) -> Response:
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, max-age=86400"})


@api_router.get("/tts/demo")
async def tts_demo(voice_id: str = DEFAULT_VOICE_ID):
    try:
        vid = voice_id if voice_id in AVAILABLE_VOICES else DEFAULT_VOICE_ID
        return audio_response(await _synth_cached(DEMO_LINE, vid))
    except Exception as e:
        logger.exception("TTS demo error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.post("/tts")
async def tts(data: TTSInput, user: dict = Depends(get_current_user)):
    if not clean_for_tts(data.text):
        raise HTTPException(status_code=400, detail="Texto vazio")
    try:
        vid = data.voice_id if data.voice_id in AVAILABLE_VOICES else (await get_user_voice_config(user["id"]))["id"]
        return audio_response(await _synth_cached(data.text, vid))
    except Exception as e:
        logger.exception("TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.get("/messages/{message_id}/audio")
async def message_audio(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id, "role": "assistant", "status": "done"}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    try:
        vc = await get_user_voice_config(user["id"])
        return audio_response(await _synth_cached(msg["content"], vc["id"]))
    except Exception as e:
        logger.exception("TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


@api_router.get("/messages/{message_id}/audio/stream")
async def message_audio_stream(message_id: str, user: dict = Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id, "role": "assistant"}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Mensagem não encontrada")
    await owned_conversation(msg["conversation_id"], user)
    text = clean_for_tts(msg.get("content", ""))
    if not text:
        raise HTTPException(status_code=400, detail="Sem texto para sintetizar")
    vc = await get_user_voice_config(user["id"])
    key = tts_key(text, vc["id"])
    cached = await db.tts_cache.find_one({"key": key}, {"_id": 0, "audio": 1})
    if cached:
        return audio_response(bytes(cached["audio"]))
    try:
        audio_iter = _tts.generate_speech_streaming(
            text=text, model=TTS_MODEL, voice=vc["voice"], speed=vc["speed"], response_format="mp3",
        )
    except Exception:
        audio_iter = None

    if audio_iter:
        chunks = []
        async def stream_and_cache():
            async for chunk in audio_iter:
                chunks.append(chunk)
                yield chunk
            audio_bytes = b"".join(chunks)
            try:
                await db.tts_cache.update_one(
                    {"key": key}, {"$set": {"audio": Binary(audio_bytes), "created_at": now_iso()}}, upsert=True
                )
            except Exception:
                pass
        return StreamingResponse(
            stream_and_cache(), media_type="audio/mpeg",
            headers={"Cache-Control": "private, max-age=86400"},
        )
    try:
        return audio_response(await _synth_cached(msg["content"], vc["id"]))
    except Exception as e:
        logger.exception("TTS stream fallback error")
        raise HTTPException(status_code=500, detail=f"Falha na voz: {e}")


# ---------------------------------------------------------------- daily reflection
REFLECTION_PROMPT = (
    "Escreva a Reflexão do Dia de hoje ({date}): uma provocação honesta e madura, de duas a três frases, "
    "em português do Brasil, para a pessoa começar o dia encarando a verdade sobre si mesma. Tema de hoje: {theme}. "
    "Texto corrido, sem markdown, sem aspas, sem título, sem saudação, sem assinatura. "
    "Escreva em primeira pessoa do singular, como um mentor ou mentora sábio(a). "
    "Termine com uma pergunta curta e incômoda."
)
REFLECTION_THEMES = [
    "responsabilidade pessoal", "disciplina e constância", "coragem de agir com medo", "aceitar o que não se controla",
    "parar de se vitimizar", "relacionamentos honestos", "propósito e direção", "autoengano", "o valor do tempo",
    "silêncio e presença", "orgulho e humildade", "o que você está adiando", "gratidão sem ilusão", "conforto que enfraquece",
]


REFLECTION_SYSTEM_PROMPT = """Você é um mentor ou mentora de amadurecimento sábio e sereno.
Fala a verdade, sem rodeios e sem bajulação, com respeito e calma.
Inspirado no estoicismo prático: responsabilidade pessoal, disciplina, autocontrole.
Fala em português do Brasil, de forma direta, calorosa, madura e SERENA.
Escreva como quem fala de forma suave e pausada: frases curtas e médias, ritmo calmo.
Nunca use formatação markdown."""


async def get_or_create_reflection() -> dict:
    today = datetime.now(BRT).date()
    date_key = today.isoformat()
    doc = await db.daily_reflections.find_one({"date": date_key}, {"_id": 0, "audio": 0})
    if doc:
        return doc
    theme = REFLECTION_THEMES[today.toordinal() % len(REFLECTION_THEMES)]
    pretty = today.strftime("%d/%m/%Y")
    try:
        llm = make_llm(f"reflection-{date_key}", REFLECTION_SYSTEM_PROMPT)
        text = (await llm.send_message(UserMessage(text=REFLECTION_PROMPT.format(date=pretty, theme=theme)))).strip()
        text = clean_for_tts(text) if "*" in text or "#" in text else text
    except Exception:
        logger.exception("reflection generation failed")
        text = ("Você já sabe o que precisa fazer hoje. O que falta não é clareza, é coragem. "
                "O que você vai continuar adiando, fingindo que não sabe?")
    doc = {"id": str(uuid.uuid4()), "date": date_key, "theme": theme, "text": text, "created_at": now_iso()}
    await db.daily_reflections.update_one({"date": date_key}, {"$setOnInsert": doc}, upsert=True)
    return await db.daily_reflections.find_one({"date": date_key}, {"_id": 0, "audio": 0})


@api_router.get("/reflection/today")
async def reflection_today(user: dict = Depends(get_current_user)):
    return await get_or_create_reflection()


@api_router.get("/reflection/today/audio")
async def reflection_today_audio(user: dict = Depends(get_current_user)):
    doc = await get_or_create_reflection()
    try:
        vc = await get_user_voice_config(user["id"])
        return audio_response(await _synth_cached(doc["text"], vc["id"]))
    except Exception as e:
        logger.exception("reflection TTS error")
        raise HTTPException(status_code=500, detail=f"Falha na síntese de voz: {e}")


# ---------------------------------------------------------------- journal
@api_router.get("/journal")
async def list_journal(user: dict = Depends(get_current_user)):
    return await db.journal_entries.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("created_at", -1).to_list(500)


@api_router.post("/journal")
async def add_journal(data: JournalInput, user: dict = Depends(get_current_user)):
    if data.type not in ("quote", "note"):
        raise HTTPException(status_code=400, detail="Tipo inválido")
    entry = {
        "id": str(uuid.uuid4()), "user_id": user["id"], "type": data.type,
        "content": data.content.strip(), "conversation_id": data.conversation_id,
        "message_id": data.message_id, "created_at": now_iso(),
    }
    await db.journal_entries.insert_one(dict(entry))
    return entry


@api_router.delete("/journal/{entry_id}")
async def delete_journal(entry_id: str, user: dict = Depends(get_current_user)):
    res = await db.journal_entries.delete_one({"id": entry_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Anotação não encontrada")
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"message": "Aurélio API online"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.user_sessions.create_index("session_token")
    await db.conversations.create_index("user_id")
    await db.messages.create_index("conversation_id")
    await db.messages.create_index("id")
    await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])
    await db.messages.create_index([("status", 1), ("created_at", -1)])
    await db.journal_entries.create_index("user_id")
    await db.tts_cache.create_index("key", unique=True)
    await db.daily_reflections.create_index("date", unique=True)
    await db.subscriptions.create_index("user_id", unique=True)
    await db.subscriptions.create_index([("status", 1), ("expires_at", 1)])
    await db.payments.create_index("provider_payment_id", unique=True)
    await db.payments.create_index("user_id")
    await db.payments.create_index([("user_id", 1), ("created_at", -1)])

    try:
        await run_subscription_maintenance()
    except Exception:
        logger.exception("startup maintenance failed")
    start_maintenance_loop()

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale = await db.messages.find(
        {"status": "pending", "created_at": {"$lt": cutoff.isoformat()}},
        {"_id": 0, "id": 1},
    ).to_list(500)
    if stale:
        await db.messages.update_many(
            {"id": {"$in": [m["id"] for m in stale]}},
            {"$set": {"status": "error",
                      "content": "A resposta foi interrompida. A resposta está sendo regenerada automaticamente agora."}},
        )

    recent_pending = await db.messages.find(
        {"status": "pending", "role": "assistant"},
        {"_id": 0, "id": 1, "conversation_id": 1},
    ).sort("created_at", -1).to_list(200)

    regenerated = 0
    for m in recent_pending:
        cid = m["conversation_id"]
        mid = m["id"]
        conv = await db.conversations.find_one({"id": cid}, {"_id": 0, "user_id": 1})
        if not conv:
            continue
        vc = await get_user_voice_config(conv["user_id"])
        prior = await db.messages.find(
            {"conversation_id": cid, "status": {"$ne": "error"}, "id": {"$ne": mid}},
            {"_id": 0},
        ).sort("created_at", 1).to_list(1000)
        user_msg = None
        for i in range(len(prior) - 1, -1, -1):
            if prior[i]["role"] == "user":
                user_msg = prior[i]["content"]
                break
        prior = [x for x in prior if x.get("content") and x["id"] != mid]
        prior = prior[:-1] if prior and prior[-1]["role"] == "user" else prior
        if user_msg and regenerated < 60:
            spawn_reply(cid, mid, user_msg, prior, "text", vc["id"])
            regenerated += 1

    if regenerated:
        logger.info(f"Regenerating {regenerated} pending replies after startup.")


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        await _httpx_client.aclose()
    except Exception:
        pass
    client.close()
