"use server";

import type { MemberChanges, NewMember } from "@/lib/backend/types";
import { actMutation } from "@/lib/server/act";
import * as service from "@/lib/server/service";

export async function addMembers(input: NewMember[]) {
  return actMutation((ctx) => service.addMembers(ctx, input));
}
export async function updateMember(id: string, changes: MemberChanges) {
  return actMutation((ctx) => service.updateMember(ctx, id, changes));
}
export async function setMemberActive(id: string, active: boolean) {
  return actMutation((ctx) => service.setMemberActive(ctx, id, active));
}
