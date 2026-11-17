/*
 * Etify's pitch shifter: an AudioWorklet that moves the pitch without
 * changing the speed (the karaoke key, the pitch knob).
 *
 * Two read heads sweep a delay line at the pitch ratio, half a window apart,
 * each faded in and out with sin² so their sum stays level: the classic
 * rotating-tape-head shifter. At a ratio of 1 the input passes straight
 * through, with no delay.
 */
const WINDOW = 2048;
const SIZE = 8192;

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }];
  }

  constructor() {
    super();
    this.buffers = [new Float32Array(SIZE), new Float32Array(SIZE)];
    this.write = 0;
    this.phase = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;
    const ratio = parameters.ratio[0];
    const frames = output[0].length;

    if (Math.abs(ratio - 1) < 1e-4) {
      for (let ch = 0; ch < output.length; ch++) output[ch].set(input[Math.min(ch, input.length - 1)]);
      // Keep the delay line filled, so a change of key starts cleanly.
      for (let i = 0; i < frames; i++) {
        for (let ch = 0; ch < 2; ch++) this.buffers[ch][this.write] = input[Math.min(ch, input.length - 1)][i];
        this.write = (this.write + 1) % SIZE;
      }
      return true;
    }

    const step = 1 - ratio;
    for (let i = 0; i < frames; i++) {
      for (let ch = 0; ch < 2; ch++) this.buffers[ch][this.write] = input[Math.min(ch, input.length - 1)][i];
      this.phase += step;
      if (this.phase < 0) this.phase += WINDOW;
      if (this.phase >= WINDOW) this.phase -= WINDOW;
      const d1 = this.phase;
      const d2 = (this.phase + WINDOW / 2) % WINDOW;
      const g1 = Math.sin((Math.PI * d1) / WINDOW) ** 2;
      const g2 = Math.sin((Math.PI * d2) / WINDOW) ** 2;
      for (let ch = 0; ch < output.length; ch++) {
        const buf = this.buffers[Math.min(ch, 1)];
        output[ch][i] = read(buf, this.write - d1 - 1) * g1 + read(buf, this.write - d2 - 1) * g2;
      }
      this.write = (this.write + 1) % SIZE;
    }
    return true;
  }
}

/** Linear interpolation at a fractional position behind the write head. */
function read(buf, pos) {
  let p = pos % SIZE;
  if (p < 0) p += SIZE;
  const i = Math.floor(p);
  const f = p - i;
  return buf[i] * (1 - f) + buf[(i + 1) % SIZE] * f;
}

registerProcessor('etify-pitch-shifter', PitchShifter);
