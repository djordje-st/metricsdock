CREATE TABLE "google_analytics_app_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_organization_id" text NOT NULL,
	"connection_id" integer NOT NULL,
	"app_id" text NOT NULL,
	"api_key" text NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_analytics_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"auth_organization_id" text NOT NULL,
	"property_id" text NOT NULL,
	"property_name" text,
	"encrypted_refresh_token" text NOT NULL,
	"scope" text,
	"last_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "google_analytics_app_mappings" ADD CONSTRAINT "google_analytics_app_mappings_auth_organization_id_organization_id_fk" FOREIGN KEY ("auth_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_analytics_app_mappings" ADD CONSTRAINT "google_analytics_app_mappings_connection_id_google_analytics_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_analytics_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_analytics_app_mappings" ADD CONSTRAINT "google_analytics_app_mappings_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_analytics_connections" ADD CONSTRAINT "google_analytics_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_analytics_connections" ADD CONSTRAINT "google_analytics_connections_auth_organization_id_organization_id_fk" FOREIGN KEY ("auth_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ga_app_mappings_auth_org_app_idx" ON "google_analytics_app_mappings" USING btree ("auth_organization_id","app_id");--> statement-breakpoint
CREATE INDEX "ga_app_mappings_connection_idx" ON "google_analytics_app_mappings" USING btree ("connection_id");--> statement-breakpoint
CREATE INDEX "ga_app_mappings_app_idx" ON "google_analytics_app_mappings" USING btree ("app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ga_connections_auth_org_property_idx" ON "google_analytics_connections" USING btree ("auth_organization_id","property_id");--> statement-breakpoint
CREATE INDEX "ga_connections_user_idx" ON "google_analytics_connections" USING btree ("user_id");