// lib/api.js (React Native / Expo)
import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { NativeModules, Platform } from "react-native";

const API_PORT = "5000";
const API_PATH = "/api";
const ENV_API_BASE_URL = process.env.EXPO_PUBLIC_API_URL?.trim();
const DEV_SERVER_HOST_PATTERN = /^[a-z]+:\/\/([^/:]+)/i;

const getDevServerHost = () => {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  return scriptURL?.match(DEV_SERVER_HOST_PATTERN)?.[1] ?? null;
};

const buildApiBaseUrl = () => {
  if (ENV_API_BASE_URL) return ENV_API_BASE_URL.replace(/\/$/, "");
  if (Platform.OS === "web") return `http://localhost:${API_PORT}${API_PATH}`;

  const devServerHost = getDevServerHost();
  if (devServerHost) return `http://${devServerHost}:${API_PORT}${API_PATH}`;

  if (Platform.OS === "android") return `http://10.0.2.2:${API_PORT}${API_PATH}`;
  return `http://localhost:${API_PORT}${API_PATH}`;
};

export const API_BASE_URL = buildApiBaseUrl();

const API = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// attach token automatically to every outgoing request
API.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default API;

// Call after a successful login/otp-verify response to persist the session token.
export const saveToken = async (token) => {
  if (token) await SecureStore.setItemAsync("token", token);
};

// Call on logout to clear the stored session.
export const clearToken = async () => {
  await SecureStore.deleteItemAsync("token");
};