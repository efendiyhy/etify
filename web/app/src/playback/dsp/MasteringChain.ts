import { bandShape, bandSpecs, curvePeakDb, makeBiquad } from './filters';
import { BAND_COUNT, type MasteringSettings } from './types';

/**
 * Etify's mastering chain: the audio engine behind the equaliser page. It
 * knows nothing about React or the page; give it settings with apply() and
 * read its analysers and meters.
 *
 * Signal flow (wet path, in order):
 *
 *   input ─┬─► preamp ─► 12-band PEQ ─► 3-band multiband compressor (LR4 crossovers)
 *          │      └─► (solo: band-pass audition)
 *          │   ─► [dry + harmonic exciter + psychoacoustic bass] ─► M/S widener with bass mono
 *          │   ─► virtual surround ─► 8D rotation ─► headphone crossfeed ─► balance ─► auto gain ─► brickwall limiter ─► soft clipper ─► wet
 *          └─► dry delay (the wet path's latency, so bypass is time-aligned) ─► dry
 *   wet + dry ─► output (+ post spectrum, meters)
 *
 * Every level change ramps with setTargetAtTime, so nothing clicks. Changing
 * a band's type or slope rebuilds that band's biquads, the one change that
 * can't be a ramp.
 */

/** The browsers' DynamicsCompressorNode looks 6 ms ahead (Chromium and Firefox alike). */
const COMPRESSOR_LOOKAHEAD = 0.006;
/** Both compressor stages (multiband, limiter) sit on the wet path. */
const WET_LATENCY = COMPRESSOR_LOOKAHEAD * 2;
const RAMP = 0.02;
const SPECTRUM_FFT = 8192;
const METER_FFT = 2048;

const db2lin = (db: number) => 10 ** (db / 20);
const lin2db = (v: number) => 20 * Math.log10(Math.max(v, 1e-9));

function curve(points: number, f: (x: number) => number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(points);
  for (let i = 0; i < points; i++) out[i] = f((i / (points - 1)) * 2 - 1);
  return out;
}

/**
 * A stereo room for the surround: decaying noise, different per ear (so it
 * sounds wide, not centred), darker as it decays. [size] 0–1 sets the length.
 */
function roomImpulse(ctx: BaseAudioContext, size: number): AudioBuffer {
  const seconds = 0.35 + size * 2.2;
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // A one-pole low-pass that closes as the tail decays: the highs die first.
      const k = 0.65 - 0.5 * t;
      low += k * (Math.random() * 2 - 1 - low);
      data[i] = low * (1 - t) ** (2.2 + (1 - size) * 2.5);
    }
  }
  return buffer;
}

/** Tube: tanh with a touch of x² (even harmonics, the warmth); tape: plain symmetric tanh. */
function saturationCurve(mode: 'tube' | 'tape', drive: number): Float32Array<ArrayBuffer> {
  const k = drive;
  const norm = Math.tanh(k);
  return curve(4096, (x) => (mode === 'tube' ? (Math.tanh(k * x) + 0.18 * x * x) / (norm + 0.18) : Math.tanh(k * x) / norm));
}

/**
 * The output's last word: linear up to 90 % of the ceiling, then a soft knee
 * that approaches the ceiling and never passes it. Fed at half level, so the
 * curve's ±1 covers ±2 (+6 dBFS) of input.
 */
function clipperCurve(ceilingDb: number): Float32Array<ArrayBuffer> {
  const ceiling = db2lin(ceilingDb);
  const knee = ceiling * 0.9;
  return curve(8192, (x) => {
    const v = x * 2;
    const a = Math.abs(v);
    if (a <= knee) return v;
    const over = (a - knee) / (ceiling - knee);
    return Math.sign(v) * (knee + (ceiling - knee) * Math.tanh(over));
  });
}

export interface MeterReading {
  /** Sample peak, dBFS, per channel. */
  peakL: number;
  peakR: number;
  /** Inter-sample peak estimate (4× interpolation), dBFS. */
  truePeak: number;
  /** Momentary (0.4 s) and short-term (3 s) loudness, LUFS (K-weighted estimate). */
  momentary: number;
  shortTerm: number;
  /** Stereo phase correlation, −1 to +1. */
  correlation: number;
  /** Gain reduction of the three compressor bands and the limiter, dB (≤ 0). */
  reduction: [number, number, number, number];
  /** The auto-gain stage's current gain, dB. */
  autoGainDb: number;
}

export class MasteringChain {
  readonly ctx: AudioContext;
  readonly input: GainNode;
  readonly output: GainNode;

  private readonly dryGain: GainNode;
  private readonly wetGain: GainNode;
  private readonly preamp: GainNode;
  private readonly joints: GainNode[] = [];
  private bandNodes: BiquadFilterNode[][] = [];
  private bandShapes: string[] = [];

  private readonly mbBypass: GainNode;
  private readonly mbWet: GainNode;
  private readonly xover: { low: BiquadFilterNode[]; lowAp: BiquadFilterNode; rest: BiquadFilterNode[]; mid: BiquadFilterNode[]; high: BiquadFilterNode[] };
  private readonly comps: DynamicsCompressorNode[] = [];
  private readonly makeups: GainNode[] = [];

  private readonly exHp: BiquadFilterNode[];
  private readonly exShaper: WaveShaperNode;
  private readonly exMix: GainNode;
  private exCurveKey = '';

  private readonly bassLp: BiquadFilterNode[];
  private readonly bassHp: BiquadFilterNode;
  private readonly bassTop: BiquadFilterNode;
  private readonly bassGain: GainNode;

  private readonly sideHp: BiquadFilterNode[];
  private readonly sideWidth: GainNode;

  private readonly surDelay: DelayNode;
  private readonly surRear: GainNode;
  private readonly surRoom: ConvolverNode;
  private readonly surRoomGain: GainNode;
  private readonly surDirect: GainNode;
  private surSize = -1;
  private readonly rotDirect: GainNode;
  private readonly rotWet: GainNode;
  private readonly rotOsc: OscillatorNode[];
  private readonly balance: [GainNode, GainNode];
  private readonly cfDirect: GainNode[];
  private readonly cfCross: GainNode[];

  private readonly autoGain: GainNode;
  private autoGainDb = 0;
  private autoGainOn = false;
  private readonly limiter: DynamicsCompressorNode;
  private readonly clipper: WaveShaperNode;
  private clipperKey = '';

  private readonly soloFilter: BiquadFilterNode;
  private readonly soloGain: GainNode;

  readonly preAnalyser: AnalyserNode;
  readonly postAnalyser: AnalyserNode;
  /** The processed level after auto gain, before the limiter: what auto gain steers. */
  private readonly agMeter: AnalyserNode;
  private readonly meterL: AnalyserNode;
  private readonly meterR: AnalyserNode;
  private readonly kL: AnalyserNode;
  private readonly kR: AnalyserNode;

  private settings: MasteringSettings | null = null;
  private active = false;
  private solo: number | null = null;
  private loudness: { t: number; ms: number }[] = [];
  private lastMeter = 0;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(ctx: AudioContext, source: AudioNode, destination: AudioNode) {
    this.ctx = ctx;
    const gain = (value = 1) => new GainNode(ctx, { gain: value });
    const lp = (frequency: number, Q = 0.7071) => new BiquadFilterNode(ctx, { type: 'lowpass', frequency, Q });
    const hp = (frequency: number, Q = 0.7071) => new BiquadFilterNode(ctx, { type: 'highpass', frequency, Q });
    const chain = (...nodes: AudioNode[]) => nodes.reduce((a, b) => (a.connect(b), b));

    // Always stereo from here on, so the M/S and crossfeed stages see two channels even from a mono source.
    this.input = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    this.output = gain();
    source.connect(this.input);
    this.output.connect(destination);

    // ---- Dry (bypass) path, delayed by the wet path's latency ---------------------
    const dryDelay = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: WET_LATENCY });
    this.dryGain = gain(1);
    chain(this.input, dryDelay, this.dryGain, this.output);
    this.wetGain = gain(0);

    // ---- Pre-EQ spectrum ------------------------------------------------------------
    this.preAnalyser = new AnalyserNode(ctx, { fftSize: SPECTRUM_FFT, smoothingTimeConstant: 0.75, minDecibels: -100, maxDecibels: -10 });
    this.input.connect(this.preAnalyser);

    // ---- Preamp and the twelve bands, between joints ------------------------------
    this.preamp = gain(1);
    this.input.connect(this.preamp);
    for (let i = 0; i <= BAND_COUNT; i++) this.joints.push(gain());
    this.preamp.connect(this.joints[0]!);
    for (let i = 0; i < BAND_COUNT; i++) {
      this.joints[i]!.connect(this.joints[i + 1]!);
      this.bandNodes.push([]);
      this.bandShapes.push('off');
    }
    const eqOut = this.joints[BAND_COUNT]!;

    // ---- Solo: one band's region, auditioned on its own -----------------------------
    this.soloFilter = new BiquadFilterNode(ctx, { type: 'bandpass', frequency: 1000, Q: 1 });
    this.soloGain = gain(0);
    chain(this.joints[0]!, this.soloFilter, this.soloGain, this.output);

    // ---- Multiband compressor: Linkwitz-Riley 24 dB/oct crossovers ------------------
    const mbIn = gain();
    eqOut.connect(mbIn);
    const mbOut = gain();
    // The bypass carries the same lookahead as a compressor, so turning the module on or off doesn't shift time.
    const mbBypassDelay = new DelayNode(ctx, { maxDelayTime: 0.02, delayTime: COMPRESSOR_LOOKAHEAD });
    this.mbBypass = gain(1);
    chain(mbIn, mbBypassDelay, this.mbBypass, mbOut);
    this.mbWet = gain(0);
    this.mbWet.connect(mbOut);
    const low = [lp(200), lp(200)];
    // LR4's low+high sum is a 2nd-order all-pass at the crossover: the low band gets the same, so the three bands sum flat.
    const lowAp = new BiquadFilterNode(ctx, { type: 'allpass', frequency: 4000, Q: 0.7071 });
    const rest = [hp(200), hp(200)];
    const mid = [lp(4000), lp(4000)];
    const high = [hp(4000), hp(4000)];
    this.xover = { low, lowAp, rest, mid, high };
    const bandsIn = [chain(mbIn, low[0]!, low[1]!, lowAp), null, null] as (AudioNode | null)[];
    const restOut = chain(mbIn, rest[0]!, rest[1]!);
    bandsIn[1] = chain(restOut, mid[0]!, mid[1]!);
    bandsIn[2] = chain(restOut, high[0]!, high[1]!);
    for (const node of bandsIn) {
      const comp = new DynamicsCompressorNode(ctx, { knee: 6 });
      const makeup = gain();
      chain(node!, comp, makeup, this.mbWet);
      this.comps.push(comp);
      this.makeups.push(makeup);
    }

    // ---- Enhancers in parallel with the dry signal --------------------------------
    const enhanced = gain();
    mbOut.connect(enhanced);
    // Harmonic exciter: high-passed, saturated, mixed back in.
    this.exHp = [hp(3000), hp(3000)];
    this.exShaper = new WaveShaperNode(ctx, { oversample: '4x' });
    this.exMix = gain(0);
    chain(mbOut, this.exHp[0]!, this.exHp[1]!, this.exShaper, this.exMix, enhanced);
    // Psychoacoustic bass: the low band's harmonics, which small speakers can play, so the ear hears the fundamental.
    this.bassLp = [lp(110), lp(110)];
    const bassDrive = gain(4);
    const bassShaper = new WaveShaperNode(ctx, {
      oversample: '4x',
      curve: curve(4096, (x) => Math.tanh(2.5 * x) * 0.7 + 0.5 * x * x),
    });
    this.bassHp = hp(110);
    this.bassTop = lp(440);
    this.bassGain = gain(0);
    chain(mbOut, this.bassLp[0]!, this.bassLp[1]!, bassDrive, bassShaper, this.bassHp, this.bassTop, this.bassGain, enhanced);

    // ---- Mid/Side widener, side high-passed so the sub-bass stays mono ------------
    const stereoIn = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    enhanced.connect(stereoIn);
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    stereoIn.connect(split);
    const midSum = gain(1);
    const sideSum = gain(1);
    const lHalf = gain(0.5);
    const rHalf = gain(0.5);
    const rHalfNeg = gain(-0.5);
    split.connect(lHalf, 0);
    split.connect(rHalf, 1);
    split.connect(rHalfNeg, 1);
    lHalf.connect(midSum);
    rHalf.connect(midSum);
    lHalf.connect(sideSum);
    rHalfNeg.connect(sideSum);
    this.sideHp = [hp(10), hp(10)];
    this.sideWidth = gain(1);
    const sideNeg = gain(-1);
    chain(sideSum, this.sideHp[0]!, this.sideHp[1]!, this.sideWidth);
    this.sideWidth.connect(sideNeg);
    const msMerge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    midSum.connect(msMerge, 0, 0);
    midSum.connect(msMerge, 0, 1);
    this.sideWidth.connect(msMerge, 0, 0);
    sideNeg.connect(msMerge, 0, 1);

    // ---- Headphone crossfeed: each ear hears a delayed, darkened bit of the other --
    // ---- Virtual surround -----------------------------------------------------------
    // The side (L−R) delayed and band-limited as a rear channel, fed back in
    // anti-phase (a matrix decoder's surround), plus a decorrelated room.
    const surOut = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    this.surDirect = gain(1);
    chain(msMerge, this.surDirect, surOut);
    const surSplit = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    msMerge.connect(surSplit);
    const surSide = gain(1);
    const surL = gain(0.5);
    const surRNeg = gain(-0.5);
    surSplit.connect(surL, 0);
    surSplit.connect(surRNeg, 1);
    surL.connect(surSide);
    surRNeg.connect(surSide);
    this.surDelay = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.015 });
    this.surRear = gain(0);
    const surRearNeg = gain(-1);
    chain(surSide, hp(180), lp(7000), this.surDelay, this.surRear);
    this.surRear.connect(surRearNeg);
    const surMerge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.surRear.connect(surMerge, 0, 0);
    surRearNeg.connect(surMerge, 0, 1);
    surMerge.connect(surOut);
    this.surRoom = new ConvolverNode(ctx, { disableNormalization: false });
    this.surRoomGain = gain(0);
    chain(msMerge, hp(150), this.surRoom, this.surRoomGain, surOut);

    // ---- 8D audio: the sound on a circle round the head ------------------------------
    // An HRTF panner whose position is driven by two oscillators a quarter-turn
    // apart (sine on x, cosine on z): audio-rate, so it moves without a timer.
    const rotOut = new GainNode(ctx, { gain: 1, channelCount: 2, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    this.rotDirect = gain(1);
    this.rotWet = gain(0);
    chain(surOut, this.rotDirect, rotOut);
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1,
      rolloffFactor: 0,
      positionX: 0,
      positionY: 0.15,
      positionZ: 0,
    });
    const sine = new OscillatorNode(ctx, { type: 'sine', frequency: 1 / 8 });
    const cosine = new OscillatorNode(ctx, {
      frequency: 1 / 8,
      periodicWave: new PeriodicWave(ctx, { real: [0, 1], imag: [0, 0], disableNormalization: true }),
    });
    sine.connect(panner.positionX);
    cosine.connect(panner.positionZ);
    sine.start();
    cosine.start();
    this.rotOsc = [sine, cosine];
    chain(surOut, panner, this.rotWet, rotOut);

    const cfSplit = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    rotOut.connect(cfSplit);
    const cfMerge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.cfDirect = [gain(1), gain(1)];
    this.cfCross = [gain(0), gain(0)];
    for (const ch of [0, 1]) {
      cfSplit.connect(this.cfDirect[ch]!, ch);
      this.cfDirect[ch]!.connect(cfMerge, 0, ch);
      const delay = new DelayNode(ctx, { maxDelayTime: 0.01, delayTime: 0.00025 });
      cfSplit.connect(delay, ch);
      chain(delay, lp(700, 0.5), this.cfCross[ch]!);
      this.cfCross[ch]!.connect(cfMerge, 0, 1 - ch);
    }

    // ---- Auto gain, brickwall limiter, soft clipper --------------------------------
    this.autoGain = gain(1);
    this.limiter = new DynamicsCompressorNode(ctx, { threshold: -0.3, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
    const clipIn = gain(0.5);
    this.clipper = new WaveShaperNode(ctx, { oversample: '4x' });
    // Balance: each side's level on its own (no mixing across, unlike a panner).
    const balSplit = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    const balMerge = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.balance = [gain(1), gain(1)];
    cfMerge.connect(balSplit);
    for (const ch of [0, 1]) {
      balSplit.connect(this.balance[ch]!, ch);
      this.balance[ch]!.connect(balMerge, 0, ch);
    }
    chain(balMerge, this.autoGain, this.limiter, clipIn, this.clipper, this.wetGain, this.output);
    this.agMeter = new AnalyserNode(ctx, { fftSize: 8192, smoothingTimeConstant: 0 });
    this.autoGain.connect(this.agMeter);

    // ---- Post spectrum and meters, on what is heard --------------------------------
    this.postAnalyser = new AnalyserNode(ctx, { fftSize: SPECTRUM_FFT, smoothingTimeConstant: 0.75, minDecibels: -100, maxDecibels: -10 });
    this.output.connect(this.postAnalyser);
    const meterSplit = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    this.output.connect(meterSplit);
    const analyser = () => new AnalyserNode(ctx, { fftSize: METER_FFT, smoothingTimeConstant: 0 });
    this.meterL = analyser();
    this.meterR = analyser();
    this.kL = analyser();
    this.kR = analyser();
    meterSplit.connect(this.meterL, 0);
    meterSplit.connect(this.meterR, 1);
    // K-weighting (ITU-R BS.1770): a high shelf around 1.7 kHz and a high-pass near 38 Hz.
    for (const [ch, target] of [
      [0, this.kL],
      [1, this.kR],
    ] as const) {
      const shelf = new BiquadFilterNode(ctx, { type: 'highshelf', frequency: 1681, gain: 4 });
      const rlb = hp(38, 0.5);
      meterSplit.connect(shelf, ch);
      chain(shelf, rlb, target);
    }

    this.timer = setInterval(() => this.trackLoudness(), 250);
  }

  /** Resumes the context when the browser started it suspended (autoplay policy): call from a click or key press. */
  resume(): Promise<void> {
    return this.ctx.state === 'running' ? Promise.resolve() : this.ctx.resume();
  }

  dispose(): void {
    clearInterval(this.timer);
    for (const osc of this.rotOsc) osc.stop();
    this.input.disconnect();
    this.output.disconnect();
  }

  /** The Pre-Amp in use: the user's, or the EQ curve's peak taken back off. */
  static effectivePreamp(settings: MasteringSettings): number {
    return settings.autoPreamp ? -curvePeakDb(settings.bands) : settings.preampDb;
  }

  /** Brings the nodes in line with [settings]: ramps for levels and frequencies, rebuilds for changed band shapes. */
  apply(settings: MasteringSettings, bypass = false): void {
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, RAMP);
    this.settings = settings;

    ramp(this.preamp.gain, db2lin(MasteringChain.effectivePreamp(settings)));

    settings.bands.forEach((band, i) => {
      const shape = bandShape(band);
      const specs = bandSpecs(band);
      if (shape !== this.bandShapes[i]) {
        this.rebuildBand(i, specs);
        this.bandShapes[i] = shape;
        return;
      }
      this.bandNodes[i]!.forEach((node, n) => {
        const spec = specs[n]!;
        ramp(node.frequency, spec.frequency);
        ramp(node.Q, spec.Q);
        ramp(node.gain, spec.gain);
      });
    });

    const { comp, exciter, bass, stereo, crossfeed, limiter, surround, eightD } = settings;
    ramp(this.mbWet.gain, comp.on ? 1 : 0);
    ramp(this.mbBypass.gain, comp.on ? 0 : 1);
    for (const node of [...this.xover.low, ...this.xover.rest]) ramp(node.frequency, comp.lowCross);
    for (const node of [this.xover.lowAp, ...this.xover.mid, ...this.xover.high]) ramp(node.frequency, comp.highCross);
    comp.bands.forEach((b, i) => {
      const c = this.comps[i]!;
      ramp(c.threshold, b.threshold);
      ramp(c.ratio, b.ratio);
      ramp(c.attack, b.attack);
      ramp(c.release, b.release);
      ramp(this.makeups[i]!.gain, db2lin(b.makeup));
    });

    const curveKey = `${exciter.mode}:${exciter.drive}`;
    if (curveKey !== this.exCurveKey) {
      this.exShaper.curve = saturationCurve(exciter.mode, exciter.drive);
      this.exCurveKey = curveKey;
    }
    for (const node of this.exHp) ramp(node.frequency, exciter.freq);
    ramp(this.exMix.gain, exciter.on ? exciter.mix : 0);

    for (const node of this.bassLp) ramp(node.frequency, bass.freq);
    ramp(this.bassHp.frequency, bass.freq);
    ramp(this.bassTop.frequency, bass.freq * 4);
    ramp(this.bassGain.gain, bass.on ? bass.amount * 0.8 : 0);

    for (const node of this.sideHp) ramp(node.frequency, stereo.on ? stereo.monoBelow : 10);
    ramp(this.sideWidth.gain, stereo.on ? stereo.width : 1);

    const size = Math.round(surround.size * 20) / 20;
    if (surround.on && size !== this.surSize) {
      // Only built when used, and again when the size changes: a new room takes a moment.
      this.surRoom.buffer = roomImpulse(this.ctx, size);
      this.surSize = size;
    }
    ramp(this.surDelay.delayTime, 0.008 + surround.size * 0.017);
    ramp(this.surRear.gain, surround.on ? surround.depth * 0.7 : 0);
    ramp(this.surRoomGain.gain, surround.on ? surround.amount * 0.9 : 0);
    ramp(this.surDirect.gain, surround.on ? 1 - surround.amount * 0.25 : 1);

    for (const osc of this.rotOsc) ramp(osc.frequency, 1 / eightD.speed);
    // HRTF is a touch quieter than the direct sound: a little lift keeps the level.
    ramp(this.rotWet.gain, eightD.on ? eightD.depth * 1.25 : 0);
    ramp(this.rotDirect.gain, eightD.on ? 1 - eightD.depth : 1);

    const cross = crossfeed.on ? crossfeed.amount * 0.5 : 0;
    for (const node of this.cfCross) ramp(node.gain, cross);
    for (const node of this.cfDirect) ramp(node.gain, 1 - cross * 0.5);

    ramp(this.limiter.threshold, limiter.on ? limiter.ceiling : 0);
    ramp(this.limiter.ratio, limiter.on ? 20 : 1);
    const clipKey = String(limiter.on ? limiter.ceiling : 0);
    if (clipKey !== this.clipperKey) {
      // A little headroom under the ceiling for the oversampling filter's overshoot.
      this.clipper.curve = clipperCurve((limiter.on ? limiter.ceiling : 0) - 0.2);
      this.clipperKey = clipKey;
    }

    ramp(this.balance[0].gain, settings.balance > 0 ? 1 - settings.balance : 1);
    ramp(this.balance[1].gain, settings.balance < 0 ? 1 + settings.balance : 1);

    this.autoGainOn = settings.autoGain;
    if (!settings.autoGain) this.setAutoGain(0);

    this.active = settings.enabled && !bypass;
    this.route();
  }

  /** Plays only band [index]'s region (Alt+click on the curve), or everything again with null. */
  setSolo(index: number | null): void {
    this.solo = index;
    const band = index === null ? null : this.settings?.bands[index];
    if (band) {
      const t = this.ctx.currentTime;
      this.soloFilter.frequency.setTargetAtTime(band.freq, t, RAMP);
      this.soloFilter.Q.setTargetAtTime(band.type === 'peaking' || band.type === 'notch' ? Math.max(0.7, band.q) : 1, t, RAMP);
    }
    this.route();
  }

  private route(): void {
    const t = this.ctx.currentTime;
    const soloing = this.solo !== null && this.settings?.enabled;
    this.soloGain.gain.setTargetAtTime(soloing ? 1 : 0, t, RAMP);
    this.wetGain.gain.setTargetAtTime(!soloing && this.active ? 1 : 0, t, RAMP);
    this.dryGain.gain.setTargetAtTime(!soloing && !this.active ? 1 : 0, t, RAMP);
  }

  private rebuildBand(i: number, specs: ReturnType<typeof bandSpecs>): void {
    const from = this.joints[i]!;
    const to = this.joints[i + 1]!;
    from.disconnect();
    for (const node of this.bandNodes[i]!) node.disconnect();
    const nodes = specs.map((spec) => makeBiquad(this.ctx, spec));
    this.bandNodes[i] = nodes;
    nodes.reduce<AudioNode>((prev, node) => (prev.connect(node), node), from).connect(to);
    // joint[0] also feeds the solo filter.
    if (i === 0) from.connect(this.soloFilter);
  }

  private setAutoGain(db: number): void {
    this.autoGainDb = db;
    this.autoGain.gain.setTargetAtTime(db2lin(db), this.ctx.currentTime, 0.4);
  }

  /** Auto gain: nudges the processed level toward the input's, a little at a time. */
  private trackLoudness(): void {
    // Measured before the limiter (which would cap any rise) and never while soloing.
    if (!this.autoGainOn || !this.active || this.solo !== null) return;
    const rms = (analyser: AnalyserNode) => {
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (const v of buffer) sum += v * v;
      return Math.sqrt(sum / buffer.length);
    };
    const pre = rms(this.preAnalyser);
    const post = rms(this.agMeter);
    if (pre < 1e-3 || post < 1e-3) return;
    const difference = lin2db(pre) - lin2db(post);
    this.setAutoGain(Math.max(-12, Math.min(12, this.autoGainDb + difference * 0.3)));
  }

  /** The meters' readings now. Call once a frame or so; loudness integrates between calls. */
  readMeters(): MeterReading {
    const l = new Float32Array(METER_FFT);
    const r = new Float32Array(METER_FFT);
    this.meterL.getFloatTimeDomainData(l);
    this.meterR.getFloatTimeDomainData(r);
    let peakL = 0;
    let peakR = 0;
    let lr = 0;
    let ll = 0;
    let rr = 0;
    for (let i = 0; i < METER_FFT; i++) {
      const a = l[i]!;
      const b = r[i]!;
      peakL = Math.max(peakL, Math.abs(a));
      peakR = Math.max(peakR, Math.abs(b));
      lr += a * b;
      ll += a * a;
      rr += b * b;
    }
    // 4× Catmull-Rom interpolation between samples: an estimate of the inter-sample (true) peak.
    let truePeak = Math.max(peakL, peakR);
    for (const buf of [l, r]) {
      for (let i = 1; i < METER_FFT - 2; i++) {
        const p0 = buf[i - 1]!;
        const p1 = buf[i]!;
        const p2 = buf[i + 1]!;
        const p3 = buf[i + 2]!;
        for (const x of [0.25, 0.5, 0.75]) {
          const v =
            0.5 * (2 * p1 + (-p0 + p2) * x + (2 * p0 - 5 * p1 + 4 * p2 - p3) * x * x + (-p0 + 3 * p1 - 3 * p2 + p3) * x * x * x);
          const a = Math.abs(v);
          if (a > truePeak) truePeak = a;
        }
      }
    }
    const correlation = ll > 1e-9 && rr > 1e-9 ? lr / Math.sqrt(ll * rr) : 0;

    // Loudness: K-weighted mean square of both channels, over 0.4 s and 3 s.
    this.kL.getFloatTimeDomainData(l);
    this.kR.getFloatTimeDomainData(r);
    let ms = 0;
    for (let i = 0; i < METER_FFT; i++) ms += l[i]! * l[i]! + r[i]! * r[i]!;
    ms /= METER_FFT;
    const now = this.ctx.currentTime;
    if (now !== this.lastMeter) {
      this.loudness.push({ t: now, ms });
      this.lastMeter = now;
    }
    this.loudness = this.loudness.filter((x) => now - x.t <= 3);
    const mean = (window: number) => {
      const items = this.loudness.filter((x) => now - x.t <= window);
      return items.length ? items.reduce((a, x) => a + x.ms, 0) / items.length : 0;
    };
    const lufs = (v: number) => (v > 1e-10 ? -0.691 + 10 * Math.log10(v) : -Infinity);

    return {
      peakL: lin2db(peakL),
      peakR: lin2db(peakR),
      truePeak: lin2db(truePeak),
      momentary: lufs(mean(0.4)),
      shortTerm: lufs(mean(3)),
      correlation,
      reduction: [this.comps[0]!.reduction, this.comps[1]!.reduction, this.comps[2]!.reduction, this.limiter.reduction],
      autoGainDb: this.autoGainDb,
    };
  }
}
