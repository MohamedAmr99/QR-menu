let ctx: AudioContext | undefined;

/** Short two-tone chime, made in code so there is no audio file to load. Needs one user tap first. */
export function chime() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  for (const [i, freq] of [880, 1320].entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.4, now + i * 0.18 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.4);
  }
}

export function unlockAudio() {
  ctx ??= new AudioContext();
  void ctx.resume();
}

/** Keeps the screen on in "receive mode" (a tablet or phone left open at the counter). */
export async function keepScreenOn(): Promise<() => void> {
  if (!('wakeLock' in navigator)) return () => {};
  let lock: WakeLockSentinel | undefined = await navigator.wakeLock.request('screen');
  const reacquire = async () => {
    if (document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
  };
  document.addEventListener('visibilitychange', reacquire);
  return () => {
    document.removeEventListener('visibilitychange', reacquire);
    void lock?.release();
    lock = undefined;
  };
}
