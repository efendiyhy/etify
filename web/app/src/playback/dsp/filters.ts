import type { EqBand } from './types';

/**
 * One EQ band as Web Audio biquads, and the curve the bands make together.
 *
 * - peaking, notch: one biquad.
 * - low/high shelf: one biquad (Web Audio's shelves have a fixed slope: no Q).
 * - high/low pass: 1, 2 or 4 biquads in series for 12, 24 or 48 dB/octave,
 *   with Butterworth Qs above 12 dB (at 12 dB the band's own Q applies).
 * - tilt: a low shelf down and a high shelf up by half the gain each, pivoting
 *   on the band's frequency.
 */

/** Butterworth stage Qs for an order-n filter built from 2nd-order sections. */
const BUTTERWORTH: Record<number, number[]> = {
  2: [0.7071],
  4: [0.5412, 1.3066],
  8: [0.5098, 0.6013, 0.9, 2.5629],
};

export interface BiquadSpec {
  type: BiquadFilterType;
  frequency: number;
  Q: number;
  gain: number;
}

/** The biquads a band needs, or none when it is off. */
export function bandSpecs(band: EqBand): BiquadSpec[] {
  if (!band.on) return [];
  const { freq, gain, q } = band;
  switch (band.type) {
    case 'peaking':
      return [{ type: 'peaking', frequency: freq, Q: q, gain }];
    case 'notch':
      return [{ type: 'notch', frequency: freq, Q: q, gain: 0 }];
    case 'lowshelf':
      return [{ type: 'lowshelf', frequency: freq, Q: 1, gain }];
    case 'highshelf':
      return [{ type: 'highshelf', frequency: freq, Q: 1, gain }];
    case 'tilt':
      return [
        { type: 'lowshelf', frequency: freq, Q: 1, gain: -gain / 2 },
        { type: 'highshelf', frequency: freq, Q: 1, gain: gain / 2 },
      ];
    case 'highpass':
    case 'lowpass': {
      const order = band.slope / 6;
      const qs = order === 2 ? [q] : BUTTERWORTH[order]!;
      return qs.map((Q) => ({ type: band.type as BiquadFilterType, frequency: freq, Q, gain: 0 }));
    }
  }
}

/** A short signature: when it changes the band's nodes must be rebuilt, else they are only retuned. */
export function bandShape(band: EqBand): string {
  return band.on ? `${band.type}:${band.slope}` : 'off';
}

export function makeBiquad(ctx: BaseAudioContext, spec: BiquadSpec): BiquadFilterNode {
  return new BiquadFilterNode(ctx, { type: spec.type, frequency: spec.frequency, Q: spec.Q, gain: spec.gain });
}

/** Log-spaced frequencies from 20 Hz to 20 kHz, for curves and spectra. */
export function logFrequencies(points: number, min = 20, max = 20000): Float32Array<ArrayBuffer> {
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) out[i] = min * (max / min) ** (i / (points - 1));
  return out;
}

let offline: OfflineAudioContext | null = null;
function measuringContext(): OfflineAudioContext | null {
  if (typeof OfflineAudioContext === 'undefined') return null;
  offline ??= new OfflineAudioContext(1, 1, 48000);
  return offline;
}

/**
 * The bands' combined response in dB at [freqs], measured by the browser's
 * own biquads (getFrequencyResponse), plus the preamp. Per band too, when
 * asked, for drawing each band's own curve.
 */
export function responseDb(bands: EqBand[], freqs: Float32Array<ArrayBuffer>, preampDb = 0): { total: Float32Array; perBand: Float32Array[] } {
  const total = new Float32Array(freqs.length).fill(preampDb);
  const perBand: Float32Array[] = [];
  const ctx = measuringContext();
  const magnitude = new Float32Array(freqs.length);
  const phase = new Float32Array(freqs.length);
  for (const band of bands) {
    const curve = new Float32Array(freqs.length);
    if (ctx) {
      for (const spec of bandSpecs(band)) {
        makeBiquad(ctx, spec).getFrequencyResponse(freqs, magnitude, phase);
        for (let i = 0; i < freqs.length; i++) curve[i]! += 20 * Math.log10(Math.max(magnitude[i]!, 1e-9));
      }
    }
    perBand.push(curve);
    for (let i = 0; i < freqs.length; i++) total[i]! += curve[i]!;
  }
  return { total, perBand };
}

const PEAK_FREQS = logFrequencies(256);

/** The EQ curve's highest point in dB (0 when it never rises above flat): what Auto Pre-Amp takes back off. */
export function curvePeakDb(bands: EqBand[]): number {
  const { total } = responseDb(bands, PEAK_FREQS);
  let peak = 0;
  for (const v of total) if (v > peak) peak = v;
  return peak;
}
