"use client";
import { use } from "react";
import { ManageRecord } from "@/components/manage";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ManageRecord id={use(params).id} />;
}
