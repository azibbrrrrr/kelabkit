"use server";

import type { CollectionChanges, NewCollection, NewParticipant } from "@/lib/backend/types";
import { act } from "@/lib/server/act";
import * as service from "@/lib/server/service";
import type { CollectionStatus } from "@/lib/types";

export async function createCollection(input: NewCollection) {
  return act((ctx) => service.createCollection(ctx, input));
}
export async function updateCollection(id: string, changes: CollectionChanges) {
  return act((ctx) => service.updateCollection(ctx, id, changes));
}
export async function setCollectionStatus(id: string, status: CollectionStatus) {
  return act((ctx) => service.setCollectionStatus(ctx, id, status));
}
export async function setCollectionIcon(id: string, icon: string | null) {
  return act((ctx) => service.setCollectionIcon(ctx, id, icon));
}
export async function addParticipants(collectionId: string, participants: NewParticipant[]) {
  return act((ctx) => service.addParticipants(ctx, collectionId, participants));
}
