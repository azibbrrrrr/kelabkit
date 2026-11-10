"use server";

import type { ContributionInput, PaymentInput } from "@/lib/backend/types";
import { actMutation } from "@/lib/server/act";
import * as service from "@/lib/server/service";

export async function setChargeAmount(chargeId: string, amount: number, reason: string | null) {
  return actMutation((ctx) => service.setChargeAmount(ctx, chargeId, amount, reason));
}
export async function setChargeExempt(chargeId: string, exempt: boolean, reason: string) {
  return actMutation((ctx) => service.setChargeExempt(ctx, chargeId, exempt, reason));
}
export async function recordPayment(input: PaymentInput) {
  return actMutation((ctx) => service.recordPayment(ctx, input));
}
export async function recordContribution(input: ContributionInput) {
  return actMutation((ctx) => service.recordContribution(ctx, input));
}
export async function confirmPayment(paymentId: string) {
  return actMutation((ctx) => service.confirmPayment(ctx, paymentId));
}
export async function reversePayment(paymentId: string, reason: string) {
  return actMutation((ctx) => service.reversePayment(ctx, paymentId, reason));
}
