"use client";
import { use } from "react";
import { ProjectEditor } from "@/components/project-workspace";
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ProjectEditor id={use(params).id} />;
}
