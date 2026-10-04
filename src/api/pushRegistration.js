// Mobile (Expo) push registration. After login, asks for notification
// permission, gets this phone's Expo push token and saves it to
// push_subscriptions so the send-push Edge Function can reach the phone even
// when the app is closed. On logout the token is removed again.
//
// Requires, in the Expo project:  npx expo install expo-notifications expo-device
// and an EAS projectId (app.json -> expo.extra.eas.projectId). Remote push
// does not work in Expo Go on Android -- use a development or production build.
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "../config/supabaseClient";

// Show pushes as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let lastToken = null;

function projectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    undefined
  );
}

export async function registerMobilePush(profileId) {
  try {
    if (!profileId || !Device.isDevice) return null;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "PawCruz",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#4DA8DA",
      });
    }

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return null;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId() });
    if (!token) return null;

    // One row per phone; logging in as someone else re-points it to them.
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        profile_id: profileId,
        kind: "expo",
        token,
        keys: null,
        user_agent: `${Platform.OS} ${Device.modelName || ""}`.trim().slice(0, 250),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );
    if (error) throw error;

    lastToken = token;
    return token;
  } catch (error) {
    console.warn("Mobile push registration failed:", error?.message || error);
    return null;
  }
}

export async function unregisterMobilePush() {
  try {
    let token = lastToken;
    if (!token && Device.isDevice) {
      const result = await Notifications.getExpoPushTokenAsync({ projectId: projectId() }).catch(() => null);
      token = result?.data || null;
    }
    if (token) await supabase.from("push_subscriptions").delete().eq("token", token);
    lastToken = null;
  } catch (error) {
    console.warn("Mobile push unregister failed:", error?.message || error);
  }
}
