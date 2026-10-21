import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { app, db } from '../firebase';

const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

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

async function sha1(text: string) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const pushAvailable = async () => !!VAPID && (await isSupported());

/**
 * Registers this device for push notifications on new orders and calls.
 * On iPhone it only works when the dashboard is added to the home screen (iOS 16.4+).
 */
export async function enablePush(rid: string, uid: string): Promise<'on' | 'denied' | 'unsupported'> {
  if (!(await pushAvailable())) return 'unsupported';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(getMessaging(app), { vapidKey: VAPID, serviceWorkerRegistration: registration });
  const id = await sha1(token);
  localStorage.setItem('pushDeviceId', id);
  await setDoc(doc(db, 'restaurants', rid, 'devices', id), {
    uid,
    fcmToken: token,
    platform: /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : /android/i.test(navigator.userAgent) ? 'android' : 'web',
    userAgent: navigator.userAgent.slice(0, 200),
    createdAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
  });
  return 'on';
}

export async function disablePush(rid: string) {
  const id = localStorage.getItem('pushDeviceId');
  if (id) await deleteDoc(doc(db, 'restaurants', rid, 'devices', id));
  localStorage.removeItem('pushDeviceId');
}
