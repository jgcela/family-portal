ALTER TYPE "public"."directory_source" ADD VALUE 'oneroster';--> statement-breakpoint
ALTER TABLE "directory_settings" ADD COLUMN "oneroster_config" jsonb;--> statement-breakpoint
ALTER TABLE "directory_settings" ADD COLUMN "oneroster_secret_enc" text;--> statement-breakpoint
ALTER TABLE "directory_settings" ADD COLUMN "oneroster_secret_hint" text;