CREATE TYPE "public"."skill_category" AS ENUM('LANGUAGE', 'FRAMEWORK', 'LIBRARY', 'DATASTORE', 'CLOUD', 'TOOL', 'PRACTICE', 'SOFT');--> statement-breakpoint
CREATE TABLE "node_tech_meta" (
	"node_id" uuid PRIMARY KEY NOT NULL,
	"category" "skill_category" NOT NULL,
	"stack" text,
	"is_core" boolean DEFAULT false NOT NULL,
	"generic" boolean DEFAULT false NOT NULL,
	"classified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "node_tech_meta" ADD CONSTRAINT "node_tech_meta_node_id_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."node_skill_cooc" AS (
    WITH df AS (
      SELECT vn.node_id, count(DISTINCT vn.vacancy_id) AS df
      FROM vacancy_nodes vn
      JOIN nodes n ON n.id = vn.node_id AND n.status <> 'HIDDEN' AND n.type = 'SKILL'
      GROUP BY vn.node_id
      HAVING count(DISTINCT vn.vacancy_id) >= 3
    ),
    vs AS (
      SELECT DISTINCT vn.vacancy_id, vn.node_id
      FROM vacancy_nodes vn JOIN df USING (node_id)
    ),
    pairs AS (
      SELECT a.node_id AS a_id, b.node_id AS b_id, count(*)::int AS cooc
      FROM vs a JOIN vs b ON a.vacancy_id = b.vacancy_id AND a.node_id <> b.node_id
      GROUP BY a.node_id, b.node_id
      HAVING count(*) >= 3
    ),
    n AS (SELECT count(*)::float8 AS t FROM vacancies)
    SELECT p.a_id, p.b_id, p.cooc,
           ln((p.cooc / (SELECT t FROM n))
              / ((da.df / (SELECT t FROM n)) * (db.df / (SELECT t FROM n))))
             / (-ln(p.cooc / (SELECT t FROM n))) AS npmi
    FROM pairs p
    JOIN df da ON da.node_id = p.a_id
    JOIN df db ON db.node_id = p.b_id
  );--> statement-breakpoint
CREATE INDEX "node_skill_cooc_a" ON "public"."node_skill_cooc" USING btree ("a_id");