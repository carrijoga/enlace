CREATE TABLE "project_link_clone_receipts" (
	"link_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "project_link_clone_receipts_link_id_user_id_pk" PRIMARY KEY("link_id","user_id"),
	CONSTRAINT "project_link_clone_receipts_project_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_link_editors" (
	"link_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "project_link_editors_link_id_user_id_pk" PRIMARY KEY("link_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_share_links" DROP CONSTRAINT "project_share_links_mode_check";--> statement-breakpoint
ALTER TABLE "project_link_clone_receipts" ADD CONSTRAINT "project_link_clone_receipts_link_id_project_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."project_share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_link_clone_receipts" ADD CONSTRAINT "project_link_clone_receipts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_link_clone_receipts" ADD CONSTRAINT "project_link_clone_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_link_editors" ADD CONSTRAINT "project_link_editors_link_id_project_share_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."project_share_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_link_editors" ADD CONSTRAINT "project_link_editors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_link_clone_receipts_user_idx" ON "project_link_clone_receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_link_editors_user_idx" ON "project_link_editors" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "project_share_links" ADD CONSTRAINT "project_share_links_mode_check" CHECK ("project_share_links"."mode" IN ('names','plan','edit','clone'));