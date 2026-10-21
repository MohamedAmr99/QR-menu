import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import { REGION } from '@qr-menu/shared';

initializeApp();
setGlobalOptions({ region: REGION, maxInstances: 10 });

export const db = getFirestore();
export const messaging = getMessaging();
