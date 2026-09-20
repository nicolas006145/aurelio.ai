import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("aurelio_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Algo deu errado. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const plansApi = {
  list: () => api.get("/plans"),
};

export const subscriptionApi = {
  get: () => api.get("/subscription"),
  cancel: () => api.post("/subscription/cancel"),
};

export const paymentsApi = {
  init: (payload) => api.post("/payments/init", payload),
  confirm: (paymentId) =>
    api.post("/payments/confirm", paymentId ? { payment_id: paymentId } : {}),
  validateCpf: (cpf) => api.post("/payments/validate-cpf", { cpf }),
  lookupCep: (cep) => api.get(`/payments/cep/${cep}`),
};
