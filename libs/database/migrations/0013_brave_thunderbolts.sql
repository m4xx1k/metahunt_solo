CREATE VIEW "public"."track_counts" AS (
    WITH own AS (
      SELECT tn.track_id,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'ROLE')  AS role_ids,
             array_agg(tn.node_id) FILTER (WHERE n.type = 'SKILL') AS skill_ids
      FROM track_nodes tn
      JOIN nodes n ON n.id = tn.node_id
      GROUP BY tn.track_id
    ),
    eff AS (
      SELECT t.id AS track_id, t.slug,
             COALESCE(o.role_ids,  po.role_ids)  AS role_ids,
             COALESCE(o.skill_ids, po.skill_ids) AS skill_ids
      FROM tracks t
      LEFT JOIN own o  ON o.track_id  = t.id
      LEFT JOIN own po ON po.track_id = t.parent_id
    )
    SELECT e.track_id, e.slug,
      CASE
        WHEN e.role_ids IS NULL AND e.skill_ids IS NULL THEN 0
        ELSE (
          SELECT count(*)
          FROM vacancies v
          JOIN nodes rn ON rn.id = v.role_node_id AND rn.status = 'VERIFIED'
          WHERE (e.role_ids IS NULL OR v.role_node_id = ANY(e.role_ids))
            AND (e.skill_ids IS NULL OR EXISTS (
                  SELECT 1 FROM vacancy_nodes vn
                  WHERE vn.vacancy_id = v.id AND vn.node_id = ANY(e.skill_ids)))
        )
      END AS vacancy_count
    FROM eff e
  );