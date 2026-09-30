import { useRef, useState, useCallback, useEffect } from "react";
import { API } from "@/lib/api";
import { getCurrentLanguage } from "@/i18n/I18nContext";

let currentAudio = null;

export function stopAllAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

function revokeAll(urls) {
  for (const url of urls) {
    try { URL.revokeObjectURL(url); } catch {}
  }
}

export function useTTS() {
  const [playingId, setPlayingId] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const cache = useRef({});

  const stop = useCallback(() => {
    stopAllAudio();
    setPlayingId(null);
  }, []);

  const clearCache = useCallback(() => {
    revokeAll(Object.values(cache.current));
    cache.current = {};
  }, []);

  useEffect(() => {
    const onLangChange = () => {
      try { stopAllAudio(); } catch {}
      clearCache();
    };
    window.addEventListener("aurelio:lang-changed", onLangChange);
    return () => {
      window.removeEventListener("aurelio:lang-changed", onLangChange);
      try { stopAllAudio(); } catch {}
      revokeAll(Object.values(cache.current));
      cache.current = {};
    };
  }, [clearCache]);

  const speak = useCallback(
    async (id, text, opts = {}) => {
      if (playingId === id) {
        stop();
        return;
      }
      stop();
      setLoadingId(id);
      try {
        let url = cache.current[id];
        if (!url) {
          const token = localStorage.getItem("aurelio_token");
          const lang = getCurrentLanguage();
          let res;
          if (opts.demo) {
            const qsParts = [];
            if (opts.voice_id) qsParts.push(`voice_id=${encodeURIComponent(opts.voice_id)}`);
            if (lang) qsParts.push(`lang=${encodeURIComponent(lang)}`);
            if (text) qsParts.push(`text=${encodeURIComponent(text)}`);
            const qs = qsParts.length ? `?${qsParts.join("&")}` : "";
            res = await fetch(`${API}/tts/demo${qs}`);
          } else if (opts.url) {
            const sep = opts.url.includes("?") ? "&" : "?";
            res = await fetch(
              `${API}${opts.url}${sep}lang=${encodeURIComponent(lang)}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          } else {
            const body = { text, lang };
            if (opts.voice_id) body.voice_id = opts.voice_id;
            res = await fetch(`${API}/tts`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify(body),
            });
          }
          if (!res.ok) throw new Error("tts failed");
          url = URL.createObjectURL(await res.blob());
          cache.current[id] = url;
        }
        const audio = new Audio(url);
        currentAudio = audio;
        audio.onended = () => setPlayingId((p) => (p === id ? null : p));
        audio.onpause = () => setPlayingId((p) => (p === id ? null : p));
        await audio.play();
        setPlayingId(id);
      } catch (e) {
        setPlayingId(null);
      } finally {
        setLoadingId(null);
      }
    },
    [playingId, stop]
  );

  return { speak, stop, playingId, loadingId, clearCache };
}
