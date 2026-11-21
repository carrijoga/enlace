CREATE TABLE "project_share_links" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"mode" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "project_share_links_mode_check" CHECK ("project_share_links"."mode" IN ('names','plan')),
	CONSTRAINT "project_share_links_label_check" CHECK (char_length("project_share_links"."label") BETWEEN 1 AND 60 AND btrim("project_share_links"."label") <> ''),
	CONSTRAINT "project_share_links_expiry_check" CHECK ("project_share_links"."expires_at" IS NULL OR "project_share_links"."expires_at" > "project_share_links"."created_at")
);
--> statement-breakpoint
ALTER TABLE "project_share_links" ADD CONSTRAINT "project_share_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_share_links_project_idx" ON "project_share_links" USING btree ("project_id");