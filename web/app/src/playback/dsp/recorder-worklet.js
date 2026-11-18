/*
 * Etify's recorder tap: copies the finished sound (both channels) to the page
 * in blocks of 4096 frames, as Float32 arrays it can encode as WAV or MP3.
 * Paused, it drops the frames (the music is paused too).
 */
const BLOCK = 4096;

class RecorderTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.left = new Float32Array(BLOCK);
    this.right = new Float32Array(BLOCK);
    this.fill = 0;
    this.running = true;
    this.port.onmessage = (e) => {
      if (e.data === 'pause') this.running = false;
      else if (e.data === 'resume') this.running = true;
      else if (e.data === 'flush') this.flush();
    };
  }

  flush() {
    if (this.fill === 0) return;
    const l = this.left.slice(0, this.fill);
    const r = this.right.slice(0, this.fill);
    this.port.postMessage({ l, r }, [l.buffer, r.buffer]);
    this.fill = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!this.running || !input || input.length === 0) return true;
    const l = input[0];
    const r = input[1] ?? input[0];
    for (let i = 0; i < l.length; i++) {
      this.left[this.fill] = l[i];
      this.right[this.fill] = r[i];
      this.fill++;
      if (this.fill === BLOCK) {
        const lc = this.left;
        const rc = this.right;
        this.port.postMessage({ l: lc, r: rc }, [lc.buffer, rc.buffer]);
        this.left = new Float32Array(BLOCK);
        this.right = new Float32Array(BLOCK);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor('etify-recorder-tap', RecorderTap);
