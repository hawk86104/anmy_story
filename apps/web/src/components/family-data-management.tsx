"use client";
import { DataManagement } from "@mylife/shared/data-management";
import { apiUrl } from "@/lib/urls";
import { clearFamilyDrafts } from "@/lib/drafts";
import { useSession } from "./session";

export function FamilyDataManagement({
  onChanged,
}: {
  onChanged?: () => Promise<void>;
}) {
  const { user, refreshProfile } = useSession();
  return (
    <DataManagement
      apiRoot={apiUrl("").replace(/\/$/, "")}
      onChanged={async () => {
        await clearFamilyDrafts(user.familyId);
        await refreshProfile();
        await onChanged?.();
      }}
    />
  );
}
