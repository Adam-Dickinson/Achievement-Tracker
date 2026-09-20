import { RARITY_LABEL, type Rarity } from "@/lib/rarity";

export interface ToastProps {
  rarity: Rarity;
  title: string;
  description: string;
  game: string;
  platform: string;
  percent: number;
}

const BORDER: Record<Rarity, string> = {
  common: "border-rarity-common",
  uncommon: "border-rarity-uncommon",
  rare: "border-rarity-rare",
  ultra_rare: "border-rarity-ultra shadow-[0_0_32px_rgba(245,165,36,0.35)]",
};

const TEXT: Record<Rarity, string> = {
  common: "text-rarity-common",
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  ultra_rare: "text-rarity-ultra",
};

/** Unlock toast. Spec: .superdesign/design-system.md ("Unlock toast"); mockup: docs/design/mockups/unlock-toast.html */
export function Toast({ rarity, title, description, game, platform, percent }: ToastProps) {
  return (
    <div
      className={`flex w-[380px] items-center gap-3 rounded-panel border bg-surface-2/95 p-4 ${BORDER[rarity]}`}
    >
      <div className={`size-16 shrink-0 rounded-card border-2 bg-surface-3 ${BORDER[rarity]}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${TEXT[rarity]}`}>
          Achievement unlocked
        </div>
        <div className="truncate text-base font-semibold">{title}</div>
        <div className="truncate text-xs text-fg-muted">{description}</div>
        <div className="mt-1 truncate text-xs text-fg-subtle">
          {game} · {platform}
        </div>
      </div>
      <div className="text-right">
        <div className={`text-xs font-semibold ${TEXT[rarity]}`}>{RARITY_LABEL[rarity]}</div>
        <div className="text-xs text-fg-muted">{percent}%</div>
      </div>
    </div>
  );
}
