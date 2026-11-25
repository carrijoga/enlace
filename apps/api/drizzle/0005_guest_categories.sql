ALTER TABLE "guests" DROP CONSTRAINT "guests_category_check";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "guest_categories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_category_check" CHECK ("guests"."category" IN ('familia','padrinho','madrinha','pajem','convidado') OR "guests"."category" ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_guest_categories_check" CHECK (jsonb_typeof("projects"."guest_categories") = 'array');