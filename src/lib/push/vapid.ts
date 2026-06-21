import webpush from "web-push";

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_CONTACT_EMAIL}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

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

export async function sendPushToUser(sub: StoredSubscription, payload: PushPayload) {
  return webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { urgency: "high" }
  );
}
