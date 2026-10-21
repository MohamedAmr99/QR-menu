import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { createEnv, ownerA } from './setup.js';

let env: RulesTestEnvironment;
const png = new Uint8Array([137, 80, 78, 71]);
// UploadTask is a thenable; wrap it so the assert helpers get a real Promise.
const done = <T>(task: PromiseLike<T>) => Promise.resolve(task);

beforeAll(async () => {
  env = await createEnv();
});
afterAll(async () => {
  await env.cleanup();
});

describe('storage', () => {
  it('owner uploads images into their own restaurant folder only', async () => {
    const storage = env.authenticatedContext('owner-a', ownerA).storage();
    await assertSucceeds(done(storage.ref('restaurants/A/items/tea.png').put(png, { contentType: 'image/png' })));
    await assertFails(done(storage.ref('restaurants/B/items/tea.png').put(png, { contentType: 'image/png' })));
    await assertFails(done(storage.ref('restaurants/A/items/x.txt').put(png, { contentType: 'text/plain' })));
  });

  it('anyone can view menu images', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await ctx.storage().ref('restaurants/A/items/cake.png').put(png, { contentType: 'image/png' });
    });
    await assertSucceeds(env.unauthenticatedContext().storage().ref('restaurants/A/items/cake.png').getDownloadURL());
  });
});
