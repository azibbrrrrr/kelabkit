CREATE TYPE "public"."club_role" AS ENUM('owner', 'committee');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."collection_type" AS ENUM('one_off', 'monthly', 'voluntary');--> statement-breakpoint
CREATE TYPE "public"."member_category" AS ENUM('guru', 'kakitangan', 'lain');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('pending', 'confirmed', 'reversed');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" text NOT NULL,
	"storage_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "attachments_size_nonneg" CHECK ("attachments"."size_bytes" >= 0),
	CONSTRAINT "attachments_sha256_hex" CHECK ("attachments"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "attachments_removed_has_reason" CHECK ("attachments"."removed_at" is null or length(btrim(coalesce("attachments"."removed_reason", ''))) > 0)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text,
	"action" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"reason" text,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
CREATE TABLE "charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"period_id" uuid,
	"member_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"exempt" boolean DEFAULT false NOT NULL,
	"exempt_reason" text,
	"due_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charges_club_id_key" UNIQUE("club_id","id"),
	CONSTRAINT "charges_amount_nonneg" CHECK ("charges"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "club_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "club_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_members_club_user_key" UNIQUE("club_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "club_settings" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"ai_reading_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"session" text NOT NULL,
	"school" text,
	"treasurer_name" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_name_not_blank" CHECK (length(btrim("clubs"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "collection_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"month" date NOT NULL,
	"due_date" date,
	CONSTRAINT "collection_periods_club_id_key" UNIQUE("club_id","id"),
	CONSTRAINT "collection_periods_collection_month_key" UNIQUE("collection_id","month"),
	CONSTRAINT "collection_periods_month_first" CHECK (extract(day from "collection_periods"."month") = 1)
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "collection_type" NOT NULL,
	"status" "collection_status" DEFAULT 'draft' NOT NULL,
	"icon" text,
	"description" text,
	"notes" text,
	"default_amount" bigint,
	"due_date" date,
	"start_month" date,
	"end_month" date,
	"due_day" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_club_id_key" UNIQUE("club_id","id"),
	CONSTRAINT "collections_name_not_blank" CHECK (length(btrim("collections"."name")) > 0),
	CONSTRAINT "collections_default_amount_nonneg" CHECK ("collections"."default_amount" is null or "collections"."default_amount" >= 0),
	CONSTRAINT "collections_due_day_range" CHECK ("collections"."due_day" is null or "collections"."due_day" between 1 and 31),
	CONSTRAINT "collections_start_month_first" CHECK ("collections"."start_month" is null or extract(day from "collections"."start_month") = 1),
	CONSTRAINT "collections_end_month_first" CHECK ("collections"."end_month" is null or extract(day from "collections"."end_month") = 1),
	CONSTRAINT "collections_month_order" CHECK ("collections"."start_month" is null or "collections"."end_month" is null or "collections"."end_month" >= "collections"."start_month")
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "member_category",
	"phone" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"joined_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_club_id_key" UNIQUE("club_id","id"),
	CONSTRAINT "members_name_not_blank" CHECK (length(btrim("members"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_override" bigint,
	"exempt" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "participants_club_collection_member_key" UNIQUE("club_id","collection_id","member_id"),
	CONSTRAINT "participants_override_nonneg" CHECK ("participants"."amount_override" is null or "participants"."amount_override" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	CONSTRAINT "payment_allocations_payment_charge_key" UNIQUE("payment_id","charge_id"),
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"member_id" uuid NOT NULL,
	"collection_id" uuid,
	"amount" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_on" date NOT NULL,
	"reference" text,
	"note" text,
	"state" "payment_state" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"reversal_reason" text,
	"reversed_by_user_id" uuid,
	CONSTRAINT "payments_club_id_key" UNIQUE("club_id","id"),
	CONSTRAINT "payments_club_idempotency_key" UNIQUE("club_id","idempotency_key"),
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_reversed_has_reason" CHECK ("payments"."state" <> 'reversed' or ("payments"."reversed_at" is not null and length(btrim(coalesce("payments"."reversal_reason", ''))) > 0))
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_payment_fk" FOREIGN KEY ("club_id","payment_id") REFERENCES "public"."payments"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_collection_fk" FOREIGN KEY ("club_id","collection_id") REFERENCES "public"."collections"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_period_fk" FOREIGN KEY ("club_id","period_id") REFERENCES "public"."collection_periods"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "charges" ADD CONSTRAINT "charges_participant_fk" FOREIGN KEY ("club_id","collection_id","member_id") REFERENCES "public"."participants"("club_id","collection_id","member_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_members" ADD CONSTRAINT "club_members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_settings" ADD CONSTRAINT "club_settings_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_periods" ADD CONSTRAINT "collection_periods_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_periods" ADD CONSTRAINT "collection_periods_collection_fk" FOREIGN KEY ("club_id","collection_id") REFERENCES "public"."collections"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_collection_fk" FOREIGN KEY ("club_id","collection_id") REFERENCES "public"."collections"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_member_fk" FOREIGN KEY ("club_id","member_id") REFERENCES "public"."members"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_fk" FOREIGN KEY ("club_id","payment_id") REFERENCES "public"."payments"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_fk" FOREIGN KEY ("club_id","charge_id") REFERENCES "public"."charges"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_member_fk" FOREIGN KEY ("club_id","member_id") REFERENCES "public"."members"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_collection_fk" FOREIGN KEY ("club_id","collection_id") REFERENCES "public"."collections"("club_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_club_idx" ON "attachments" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "attachments_payment_idx" ON "attachments" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "audit_logs_club_at_idx" ON "audit_logs" USING btree ("club_id","at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "charges_member_collection_period_key" ON "charges" USING btree ("member_id","collection_id",coalesce("period_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX "charges_club_idx" ON "charges" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "charges_collection_idx" ON "charges" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "club_members_club_idx" ON "club_members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "club_members_user_idx" ON "club_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collection_periods_club_idx" ON "collection_periods" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "collections_club_idx" ON "collections" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "members_club_idx" ON "members" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "participants_club_idx" ON "participants" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "participants_member_idx" ON "participants" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_club_idx" ON "payment_allocations" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_charge_idx" ON "payment_allocations" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "payments_club_idx" ON "payments" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "payments_member_idx" ON "payments" USING btree ("member_id");