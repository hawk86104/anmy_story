"use client";

import { useLinkStatus } from "next/link";

export function NavigationFeedback() {
  const { pending } = useLinkStatus();
  return (
    <span
      className={`navigation-feedback${pending ? " is-pending" : ""}`}
      aria-hidden="true"
    />
  );
}
