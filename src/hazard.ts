export type Level = 'normal' | 'caution' | 'high' | 'unknown';
export interface Thresholds { maxWind: number; cautionWind: number; humidity: number; staleSec: number }
export interface WxInput { windSpeed: number | null; humidity: number | null; temperature: number | null; ageSec: number | null }
export const LEVEL_HY: Record<Level, string> = { normal: 'Նորմալ', caution: 'Զգուշացում', high: 'Բարձր ռիսկ', unknown: 'Անհայտ / անբավարար տվյալներ' };

/** Explainable rule-based assessment. NOT a hail/cyclone predictor: humidity+temperature cannot confirm hail. */
export function assess(w: WxInput, t: Thresholds): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  if (w.ageSec === null || w.windSpeed === null) return { level: 'unknown', reasons: ['Քամու տվյալները բացակայում են. գնահատումը թերի է։'] };
  if (w.ageSec > t.staleSec) return { level: 'unknown', reasons: [`Տվյալները հնացած են (${Math.round(w.ageSec)} վ > ${t.staleSec} վ). գնահատումը թերի է։`] };
  let score = 0;
  if (w.windSpeed > t.maxWind) { score += 2; reasons.push(`Քամին ${w.windSpeed.toFixed(1)} մ/վ գերազանցում է սահմանը (${t.maxWind} մ/վ)։`); }
  else if (w.windSpeed > t.cautionWind) { score += 1; reasons.push(`Քամին ${w.windSpeed.toFixed(1)} մ/վ մոտ է սահմանին։`); }
  if (w.humidity !== null && w.humidity > t.humidity) { score += 1; reasons.push(`Խոնավությունը ${w.humidity}% բարձր է (${t.humidity}%)։ Սա միայն «կարկուտին նպաստավոր պայմանների» թույլ ցուցիչ է, ոչ կանխատեսում։`); }
  if (reasons.length === 0) reasons.push('Բոլոր ցուցիչները սահմաններում են։');
  return { level: score >= 2 ? 'high' : score === 1 ? 'caution' : 'normal', reasons };
}
