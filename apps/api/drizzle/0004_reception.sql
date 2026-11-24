CREATE TABLE "table_assignments" (
	"project_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "table_assignments_project_id_guest_id_pk" PRIMARY KEY("project_id","guest_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "reception_schema_version" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "reception" jsonb;--> statement-breakpoint
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_assignments" ADD CONSTRAINT "table_assignments_project_id_guest_id_guests_project_id_id_fk" FOREIGN KEY ("project_id","guest_id") REFERENCES "public"."guests"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_assignments_project_table_idx" ON "table_assignments" USING btree ("project_id","table_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_reception_check" CHECK (("projects"."reception" IS NULL) = ("projects"."reception_schema_version" IS NULL) AND ("projects"."reception" IS NULL OR (jsonb_typeof("projects"."reception") = 'object' AND "projects"."reception_schema_version" = 1)));