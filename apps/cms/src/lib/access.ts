import type { Access, AccessResult, PayloadRequest } from "payload";
import type { Member } from "@mylife/shared";

export const member = (req: Pick<PayloadRequest, "user">) =>
  req.user as unknown as Member | null;
export const authenticated: Access = ({ req }) => Boolean(member(req));
export const parentOnly: Access = ({ req }) => member(req)?.role === "parent";
export const familyOnly: Access = ({ req }) => {
  const user = member(req);
  return user ? { familyId: { equals: user.familyId } } : false;
};
export const editEntry: Access = ({ req }): AccessResult => {
  const user = member(req);
  if (!user) return false;
  if (user.role === "parent") return { familyId: { equals: user.familyId } };
  return {
    and: [
      { familyId: { equals: user.familyId } },
      { author: { equals: user.id } },
    ],
  };
};
export const relationId = (value: unknown): number =>
  Number(
    typeof value === "object" && value !== null && "id" in value
      ? value.id
      : value,
  );
