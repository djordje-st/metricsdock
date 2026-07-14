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
CREATE TABLE "app_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"app_id" text NOT NULL,
	"shop_id" integer,
	"partner_event_id" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"amount" numeric(18, 6),
	"currency_code" text,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"shop_id" integer NOT NULL,
	"charge_id" text NOT NULL,
	"name" text,
	"interval" text,
	"status" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"mrr_amount" numeric(18, 6) NOT NULL,
	"currency_code" text,
	"accepted_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"app_id" text NOT NULL,
	"shop_id" integer,
	"partner_transaction_id" text NOT NULL,
	"transaction_type" text NOT NULL,
	"charge_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"gross_amount" numeric(18, 6),
	"net_amount" numeric(18, 6),
	"currency_code" text,
	"raw_payload" jsonb NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"inviter_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partner_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"partner_app_id" text NOT NULL,
	"api_key" text,
	"name" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"auth_organization_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"name" text,
	"encrypted_token" text NOT NULL,
	"has_manage_apps" boolean DEFAULT false NOT NULL,
	"has_view_financials" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkey" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"public_key" text NOT NULL,
	"user_id" text NOT NULL,
	"credential_id" text NOT NULL,
	"counter" integer NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean NOT NULL,
	"transports" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"aaguid" text
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
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "shop_app_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"shop_id" integer NOT NULL,
	"status" text NOT NULL,
	"installed_at" timestamp with time zone,
	"uninstalled_at" timestamp with time zone,
	"reactivated_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"shopify_shop_id" text,
	"myshopify_domain" text NOT NULL,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_leases" (
	"key" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"connection_id" integer NOT NULL,
	"app_id" text,
	"job_id" text,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"cursor" text,
	"window_start" timestamp with time zone,
	"window_end" timestamp with time zone,
	"events_count" integer DEFAULT 0 NOT NULL,
	"transactions_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "test_shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_organization_id" text NOT NULL,
	"shop_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uninstall_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"shop_id" integer,
	"reason" text NOT NULL,
	"description" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_connection_id_partner_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."partner_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_events" ADD CONSTRAINT "app_events_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_subscriptions" ADD CONSTRAINT "app_subscriptions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_connection_id_partner_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."partner_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_apps" ADD CONSTRAINT "partner_apps_connection_id_partner_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."partner_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_connections" ADD CONSTRAINT "partner_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_connections" ADD CONSTRAINT "partner_connections_auth_organization_id_organization_id_fk" FOREIGN KEY ("auth_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkey" ADD CONSTRAINT "passkey_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_app_relationships" ADD CONSTRAINT "shop_app_relationships_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_app_relationships" ADD CONSTRAINT "shop_app_relationships_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_partner_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."partner_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_shops" ADD CONSTRAINT "test_shops_auth_organization_id_organization_id_fk" FOREIGN KEY ("auth_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_shops" ADD CONSTRAINT "test_shops_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uninstall_feedback" ADD CONSTRAINT "uninstall_feedback_app_id_partner_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."partner_apps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uninstall_feedback" ADD CONSTRAINT "uninstall_feedback_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_events_connection_partner_event_idx" ON "app_events" USING btree ("connection_id","partner_event_id");--> statement-breakpoint
CREATE INDEX "app_events_app_occurred_idx" ON "app_events" USING btree ("app_id","occurred_at");--> statement-breakpoint
CREATE INDEX "app_events_app_type_occurred_idx" ON "app_events" USING btree ("app_id","type","occurred_at");--> statement-breakpoint
CREATE INDEX "app_events_shop_occurred_idx" ON "app_events" USING btree ("shop_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "app_subscriptions_app_shop_charge_idx" ON "app_subscriptions" USING btree ("app_id","shop_id","charge_id");--> statement-breakpoint
CREATE INDEX "app_subscriptions_app_status_idx" ON "app_subscriptions" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "app_subscriptions_shop_status_idx" ON "app_subscriptions" USING btree ("shop_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "financial_transactions_connection_partner_idx" ON "financial_transactions" USING btree ("connection_id","partner_transaction_id");--> statement-breakpoint
CREATE INDEX "financial_transactions_app_created_idx" ON "financial_transactions" USING btree ("app_id","created_at");--> statement-breakpoint
CREATE INDEX "financial_transactions_shop_created_idx" ON "financial_transactions" USING btree ("shop_id","created_at");--> statement-breakpoint
CREATE INDEX "invitation_organization_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_idx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "organization_slug_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "partner_apps_connection_idx" ON "partner_apps" USING btree ("connection_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_apps_connection_partner_app_idx" ON "partner_apps" USING btree ("connection_id","partner_app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_connections_auth_org_partner_org_idx" ON "partner_connections" USING btree ("auth_organization_id","organization_id");--> statement-breakpoint
CREATE INDEX "partner_connections_user_idx" ON "partner_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_user_idx" ON "passkey" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "passkey_credential_idx" ON "passkey" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_app_relationships_app_shop_idx" ON "shop_app_relationships" USING btree ("app_id","shop_id");--> statement-breakpoint
CREATE INDEX "shop_app_relationships_status_idx" ON "shop_app_relationships" USING btree ("app_id","status");--> statement-breakpoint
CREATE INDEX "shop_app_relationships_shop_app_idx" ON "shop_app_relationships" USING btree ("shop_id","app_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_myshopify_domain_idx" ON "shops" USING btree ("myshopify_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "shops_shopify_shop_id_idx" ON "shops" USING btree ("shopify_shop_id");--> statement-breakpoint
CREATE INDEX "sync_runs_connection_started_idx" ON "sync_runs" USING btree ("connection_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_app_started_idx" ON "sync_runs" USING btree ("app_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_shops_auth_org_shop_idx" ON "test_shops" USING btree ("auth_organization_id","shop_id");--> statement-breakpoint
CREATE INDEX "uninstall_feedback_app_occurred_idx" ON "uninstall_feedback" USING btree ("app_id","occurred_at");--> statement-breakpoint
CREATE INDEX "uninstall_feedback_shop_occurred_idx" ON "uninstall_feedback" USING btree ("shop_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uninstall_feedback_partner_identity_idx" ON "uninstall_feedback" USING btree ("app_id","shop_id","occurred_at","reason") WHERE "uninstall_feedback"."shop_id" is not null;