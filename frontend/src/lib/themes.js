import { Target, Heart, Compass, Flame, Briefcase, Eye, MessageSquare } from "lucide-react";
import { useI18n } from "@/i18n/I18nContext";

export const THEME_IDS = ["disciplina", "relacionamentos", "proposito", "emocoes", "carreira", "autoconhecimento", "outros"];

const THEME_ICONS = {
  disciplina: Target,
  relacionamentos: Heart,
  proposito: Compass,
  emocoes: Flame,
  carreira: Briefcase,
  autoconhecimento: Eye,
  outros: MessageSquare,
};

export function buildThemes(t) {
  return THEME_IDS.map((id) => ({
    id,
    label: t(`themes.${id}`),
    Icon: THEME_ICONS[id],
  }));
}

export function useThemes() {
  const { t } = useI18n();
  return buildThemes(t);
}

export function themeOf(id, t) {
  const icon = THEME_ICONS[id] || THEME_ICONS.outros;
  const label = t ? t(`themes.${id}`) : id;
  return { id: id || "outros", label, Icon: icon };
}

export const THEMES = THEME_IDS.map((id) => ({
  id,
  label: id,
  Icon: THEME_ICONS[id],
}));
