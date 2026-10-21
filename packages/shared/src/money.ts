/** Prices are stored as integer piasters (1 EGP = 100). */
export function toMinor(pounds: number): number {
  return Math.round(pounds * 100);
}

export function formatEGP(minor: number, lang: 'ar' | 'en' = 'ar'): string {
  const pounds = minor / 100;
  const digits = Number.isInteger(pounds) ? 0 : 2;
  const n = pounds.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-EG', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return lang === 'ar' ? `${n} ج.م` : `EGP ${n}`;
}
