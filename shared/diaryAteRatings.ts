export const DIARY_ATE_RATING_OPTIONS = [
  { value: "yummy", label: "Yummy! I finished all" },
  { value: "tasty", label: "Tasty! I almost finished" },
  { value: "good", label: "Good! I ate half" },
  { value: "so-so", label: "So so! I ate a little bit" },
  { value: "nah-nah", label: "Nah nah! I only had few bites" },
  { value: "yucky", label: "Yucky! I barely touched" },
] as const;

export type DiaryAteRating = (typeof DIARY_ATE_RATING_OPTIONS)[number]["value"];

export function isDiaryAteRating(value: string): value is DiaryAteRating {
  return DIARY_ATE_RATING_OPTIONS.some((option) => option.value === value);
}

export function formatDiaryAteRating(value: string): string {
  return DIARY_ATE_RATING_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
