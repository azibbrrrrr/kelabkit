"use server";

import type { CollectionChanges, NewCollection, NewParticipant } from "@/lib/backend/types";
import { actMutation } from "@/lib/server/act";
import * as service from "@/lib/server/service";
import type { CollectionStatus } from "@/lib/types";

export async function createCollection(input: NewCollection) {
  return actMutation((ctx) => service.createCollection(ctx, input));
}
export async function updateCollection(id: string, changes: CollectionChanges) {
  return actMutation((ctx) => service.updateCollection(ctx, id, changes));
}
export async function setCollectionStatus(id: string, status: CollectionStatus) {
  return actMutation((ctx) => service.setCollectionStatus(ctx, id, status));
}
export async function setCollectionIcon(id: string, icon: string | null) {
  return actMutation((ctx) => service.setCollectionIcon(ctx, id, icon));
}
export async function addParticipants(collectionId: string, participants: NewParticipant[]) {
  return actMutation((ctx) => service.addParticipants(ctx, collectionId, participants));
}
