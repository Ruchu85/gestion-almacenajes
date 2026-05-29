"use server";

import { cookies } from "next/headers";
import { ENV_COOKIE, type EnvMode } from "@/lib/env-mode";

export async function setEnvMode(mode: EnvMode): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ENV_COOKIE, mode, {
    path: "/",
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // 30 días
  });
}
