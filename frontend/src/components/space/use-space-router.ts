"use client";

import { useRouter } from "next/navigation";
import { spacePath, useSpace } from "./space-provider";

/** `useRouter` whose `push` and `replace` stay inside the current role space. */
export function useSpaceRouter() {
  const router = useRouter();
  const role = useSpace();
  return {
    ...router,
    push: (href: string) => router.push(spacePath(role, href)),
    replace: (href: string) => router.replace(spacePath(role, href)),
  };
}
