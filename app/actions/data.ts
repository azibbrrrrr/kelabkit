"use server";

import { act } from "@/lib/server/act";
import * as service from "@/lib/server/service";

export async function loadSnapshot() {
  return act((ctx) => service.load(ctx));
}
