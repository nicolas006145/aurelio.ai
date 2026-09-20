import { API } from "@/lib/api";

function authHeaders(extra = {}) {
  const token = localStorage.getItem("aurelio_token");
  return { Authorization: `Bearer ${token}`, ...extra };
}

export async function openChatStream(convId, message) {
  return fetch(`${API}/conversations/${convId}/chat`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message }),
  });
}

export async function startChatTurn(convId, message) {
  const res = await fetch(`${API}/conversations/${convId}/chat/start`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message }),
    keepalive: message.length < 12000,
  });
  if (!res.ok) throw new Error(`start failed: ${res.status}`);
  return res.json();
}

export async function openResumeStream(messageId) {
  return fetch(`${API}/messages/${messageId}/stream`, { headers: authHeaders() });
}

const BATCH_WINDOW_MS = 32;

export async function consumeSSE(res, onEvent) {
  if (!res.ok) throw new Error(`stream failed: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let flushTimer = null;
  let pendingDeltas = "";
  let pendingOther = [];

  const flush = () => {
    flushTimer = null;
    if (pendingDeltas) {
      onEvent({ delta: pendingDeltas });
      pendingDeltas = "";
    }
    for (const ev of pendingOther) onEvent(ev);
    pendingOther = [];
  };

  const scheduleFlush = () => {
    if (flushTimer == null) {
      flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
    }
  };

  const handle = (ev) => {
    if (typeof ev.delta === "string") {
      pendingDeltas += ev.delta;
      scheduleFlush();
    } else {
      pendingOther.push(ev);
      scheduleFlush();
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data: /, "").trim();
        if (line) handle(JSON.parse(line));
      }
    }
  } finally {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (pendingDeltas || pendingOther.length) flush();
  }
}
