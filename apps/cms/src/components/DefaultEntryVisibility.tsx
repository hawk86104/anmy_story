"use client";

import { useEffect, useRef } from "react";
import { useDocumentInfo, useField, useOperation } from "@payloadcms/ui";

// Keep the database's defensive default while making the admin form match the
// public-by-default publishing flow in the main editor.
export default function DefaultEntryVisibility() {
  const operation = useOperation();
  const { initialData } = useDocumentInfo();
  const { formInitializing, setValue } = useField<string>({ path: "visibility" });
  const initialized = useRef(false);

  useEffect(() => {
    if (!operation || formInitializing || initialized.current) return;
    initialized.current = true;
    const newRecord = operation === "create" && !initialData?.visibility;
    const publicDraft =
      operation === "update" &&
      initialData?.status === "draft" &&
      initialData.visibility === "family" &&
      initialData.publicRequested === true &&
      initialData.reviewStatus === "none";
    if (newRecord || publicDraft) setValue("public", true);
  }, [formInitializing, initialData, operation, setValue]);
  return null;
}
