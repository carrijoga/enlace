CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rateLimit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"lastRequest" bigint NOT NULL,
	CONSTRAINT "rateLimit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "guests" (
	"id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "guests_project_id_id_pk" PRIMARY KEY("project_id","id"),
	CONSTRAINT "guests_category_check" CHECK ("guests"."category" IN ('familia','padrinho','madrinha','pajem','convidado'))
);
--> statement-breakpoint
CREATE TABLE "project_write_receipts" (
	"project_id" uuid NOT NULL,
	"actor_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"result_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_write_receipts_project_id_actor_id_operation_id_pk" PRIMARY KEY("project_id","actor_id","operation_id"),
	CONSTRAINT "project_write_receipts_revision_positive_check" CHECK ("project_write_receipts"."result_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"couple_first" text NOT NULL,
	"couple_second" text NOT NULL,
	"wedding_date" date,
	"layout_schema_version" integer DEFAULT 1 NOT NULL,
	"layout" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_layout_schema_version_check" CHECK ("projects"."layout_schema_version" = 1),
	CONSTRAINT "projects_revision_positive_check" CHECK ("projects"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "seat_assignments" (
	"project_id" uuid NOT NULL,
	"seat_id" uuid NOT NULL,
	"guest_id" uuid NOT NULL,
	CONSTRAINT "seat_assignments_project_id_seat_id_pk" PRIMARY KEY("project_id","seat_id"),
	CONSTRAINT "seat_assignments_project_guest_unique" UNIQUE("project_id","guest_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guests" ADD CONSTRAINT "guests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_write_receipts" ADD CONSTRAINT "project_write_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_write_receipts" ADD CONSTRAINT "project_write_receipts_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_assignments" ADD CONSTRAINT "seat_assignments_project_id_guest_id_guests_project_id_id_fk" FOREIGN KEY ("project_id","guest_id") REFERENCES "public"."guests"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "guests_project_order_idx" ON "guests" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "project_write_receipts_created_idx" ON "project_write_receipts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "projects_owner_updated_idx" ON "projects" USING btree ("owner_id","updated_at" DESC NULLS LAST);