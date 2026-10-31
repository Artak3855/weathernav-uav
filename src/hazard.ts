export type Level = 'normal' | 'caution' | 'high' | 'unknown';
export interface Thresholds { maxWind: number; cautionWind: number; humidity: number; staleSec: number }
export interface WxInput { windSpeed: number | null; humidity: number | null; temperature: number | null; ageSec: number | null }
export const LEVEL_HY: Record<Level, string> = { normal: 'Նորմալ', caution: 'Զգուշացում', high: 'Բարձր ռիսկ', unknown: 'Անհայտ / անբավարար տվյալներ' };

/**
 * Հաշվարկում է խոնավ բեկման ցուցիչը (Wet Refractivity - Nw) 
 * հիմնված ՄՌՏ/GNSS օդերևութաբանական մոդելների վրա (IEEE հոդվածների հիման վրա):
 */
function computeWetRefractivity(tempC: number, humidityPercent: number): number {
  const T = tempC + 273.15; // Ջերմաստիճանը Կելվիններով
  const es = 6.112 * Math.exp((17.67 * tempC) / (tempC + 243.5));
  const e = (humidityPercent / 100) * es;
  const Nw = (77.6 * e / T) + (3.73e5 * e / (T * T));
  return Nw;
}

/** Explainable rule-based assessment. NOT a hail/cyclone predictor: humidity+temperature cannot confirm hail. */
export function assess(w: WxInput, t: Thresholds): { level: Level; reasons: string[] } {
  const reasons: string[] = [];
  if (w.ageSec === null || w.windSpeed === null) return { level: 'unknown', reasons: ['Քամու տվյալները բացակայում են. գնահատումը թերի է։'] };
  if (w.ageSec > t.staleSec) return { level: 'unknown', reasons: [`Տվյալները հնացած են (${Math.round(w.ageSec)} վ > ${t.staleSec} վ). գնահատումը թերի է։`] };
  
  let score = 0;
  if (w.windSpeed > t.maxWind) { score += 2; reasons.push(`Քամին ${w.windSpeed.toFixed(1)} մ/վ գերազանցում է սահմանը (${t.maxWind} մ/վ)։`); }
  else if (w.windSpeed > t.cautionWind) { score += 1; reasons.push(`Քամին ${w.windSpeed.toFixed(1)} մ/վ մոտ է սահմանին։`); }
  
  if (w.humidity !== null && w.humidity > t.humidity) { 
    score += 1; 
    
    // Եթե ունենք նաև ջերմաստիճան, հաշվարկում ենք գիտական Wet Refractivity ցուցանիշը
    if (w.temperature !== null) {
      const nw = computeWetRefractivity(w.temperature, w.humidity);
      reasons.push(`Խոնավությունը ${w.humidity}% բարձր է (${t.humidity}%) | Խոնավ բեկման ցուցիչ (Nw): ${nw.toFixed(1)} ppm։ Սա միայն «կարկուտին/մառախուղին նպաստավոր պայմանների» ցուցիչ է։`);
    } else {
      reasons.push(`Խոնավությունը ${w.humidity}% բարձր է (${t.humidity}%)։ Սա միայն «կարկուտին նպաստավոր պայմանների» թույլ ցուցիչ է, ոչ կանխատեսում։`);
    }
  }

  if (reasons.length === 0) reasons.push('Բոլոր ցուցանիշները սահմաններում են։');
  return { level: score >= 2 ? 'high' : score === 1 ? 'caution' : 'normal', reasons };
}
