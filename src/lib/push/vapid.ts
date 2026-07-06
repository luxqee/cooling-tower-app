import webpush from "web-push";

interface PushPayload {
  title: string;
  body: string;
  url: string;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidInitialised = false;

function ensureVapid() {
  if (vapidInitialised) return;
  const contact = process.env.VAPID_CONTACT_EMAIL;
  const pubKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privKey = process.env.VAPID_PRIVATE_KEY;
  if (!contact || !pubKey || !privKey) {
    throw new Error("VAPID env vars not set: VAPID_CONTACT_EMAIL, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY");
  }
  webpush.setVapidDetails(`mailto:${contact}`, pubKey, privKey);
  vapidInitialised = true;
}

export async function sendPushToUser(sub: StoredSubscription, payload: PushPayload) {
  ensureVapid();
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { urgency: "high" }
  );
}
