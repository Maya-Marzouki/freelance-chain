"use client";

import NextLink from "next/link";
import { spacePath, useSpace } from "./space-provider";

/** `next/link` that keeps navigation inside the current role space. */
export default function Link({ href, ...props }: React.ComponentProps<typeof NextLink>) {
  const role = useSpace();
  return <NextLink href={typeof href === "string" ? spacePath(role, href) : href} {...props} />;
}
