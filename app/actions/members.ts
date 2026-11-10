"use server";

import type { MemberChanges, NewMember } from "@/lib/backend/types";
import { act } from "@/lib/server/act";
import * as service from "@/lib/server/service";

export async function addMembers(input: NewMember[]) {
  return act((ctx) => service.addMembers(ctx, input));
}
export async function updateMember(id: string, changes: MemberChanges) {
  return act((ctx) => service.updateMember(ctx, id, changes));
}
export async function setMemberActive(id: string, active: boolean) {
  return act((ctx) => service.setMemberActive(ctx, id, active));
}
