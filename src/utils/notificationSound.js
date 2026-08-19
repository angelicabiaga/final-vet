import notificationSoundUrl from "../assets/reference/notification/notification_sound.mp3";

// NotificationBell lives inside AppShell, which every page mounts fresh --
// so it remounts on every in-app navigation, not just at login. This set
// is module-level (survives across those remounts for the life of the
// browser tab) so the "welcome back" summary only ever fires once per
// profile per real session, not once per page visited.
const welcomedProfileIds = new Set();

export function hasBeenWelcomed(profileId) {
  return welcomedProfileIds.has(profileId);
}

export function markWelcomed(profileId) {
  welcomedProfileIds.add(profileId);
}

export function clearWelcomed() {
  welcomedProfileIds.clear();
}

let cachedAudio = null;

export function playNotificationSound() {
  try {
    if (!cachedAudio) {
      cachedAudio = new Audio(notificationSoundUrl);
    }
    cachedAudio.currentTime = 0;
    // .play() rejects under some autoplay policies (e.g. before the user
    // has interacted with the page yet) -- never let that break the
    // notification itself.
    cachedAudio.play().catch(() => {});
  } catch {
    // Ignore -- sound is a nice-to-have, not a requirement.
  }
}
