"use client";

/** En la APK: mantiene programados en Android los avisos de Sofía y abre el cliente al tocar uno. */
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { notificationsAvailable, onNotificationTap, syncDeviceReminders } from "./native";

export function ReminderSync() {
  const router = useRouter();
  useEffect(() => {
    if (!notificationsAvailable()) return;
    const run = () => void syncDeviceReminders().catch(() => {});
    run();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(run, 10 * 60_000);
    const off = onNotificationTap((url) => router.push(url));
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
      off();
    };
  }, [router]);
  return null;
}
