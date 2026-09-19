-- Relational predicates execute before PostgREST's scalar filters/order/limit.
-- SECURITY INVOKER preserves the caller's table permissions and RLS policies.
CREATE OR REPLACE FUNCTION public.filter_player_cards(filters jsonb DEFAULT '{}'::jsonb)
RETURNS SETOF public.card_versions
LANGUAGE sql STABLE SECURITY INVOKER
AS $function$
  SELECT c.* FROM public.card_versions c
  JOIN public.players p ON p.id = c.player_id
  WHERE (
    COALESCE(filters->>'name', '') = ''
    OR p.name ILIKE ('%' || replace(replace(replace(filters->>'name', E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
    OR p.long_name ILIKE ('%' || replace(replace(replace(filters->>'name', E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%')
  )
  AND (
    COALESCE(jsonb_array_length(filters->'positions'), 0) = 0
    OR (SELECT CASE WHEN COALESCE((filters->>'hasAllPositions')::boolean, false)
      THEN bool_and(matched) ELSE bool_or(matched) END
      FROM (
        SELECT EXISTS (
          SELECT 1 FROM public.card_positions cp JOIN public.positions pos ON pos.id = cp.position_id
          WHERE cp.card_id = c.id AND pos.name = selected.value
            AND (NOT COALESCE((filters->>'onlyPrimary')::boolean, false) OR cp.is_primary)
        ) AS matched FROM jsonb_array_elements_text(filters->'positions') selected
      ) matches)
  )
  AND (
    COALESCE(jsonb_array_length(filters->'selectedRoles'), 0) = 0
    OR (SELECT CASE WHEN COALESCE((filters->>'hasAllRoles')::boolean, false)
      THEN bool_and(matched) ELSE bool_or(matched) END
      FROM (
        SELECT EXISTS (
          SELECT 1 FROM public.card_roles cr JOIN public.roles r ON r.id = cr.role_id
          WHERE cr.card_id = c.id AND r.position = selected.value->>'position'
            AND r.role_name = selected.value->>'name'
            AND CASE WHEN (selected.value->>'level')::integer = 2
              THEN cr.role_level = 2 ELSE cr.role_level >= 1 END
        ) AS matched FROM jsonb_array_elements(filters->'selectedRoles') selected
      ) matches)
  )
  AND (
    COALESCE(jsonb_array_length(filters->'selectedPlayStyles'), 0) = 0
    OR (SELECT CASE WHEN COALESCE((filters->>'requireAllPlaystyles')::boolean, false)
      THEN bool_and(matched) ELSE bool_or(matched) END
      FROM (
        SELECT EXISTS (
          SELECT 1 FROM public.card_playstyles ps
          WHERE ps.card_id = c.id AND ps.playstyle_id::text = selected.value->>'id'
            AND ps.is_plus = (selected.value->>'level' = 'plus')
        ) AS matched FROM jsonb_array_elements(filters->'selectedPlayStyles') selected
      ) matches)
  )
  AND (
    (NULLIF(filters->>'minPlaystyles', '') IS NULL AND NULLIF(filters->>'maxPlaystyles', '') IS NULL
      AND NULLIF(filters->>'minPlaystylesPlus', '') IS NULL AND NULLIF(filters->>'maxPlaystylesPlus', '') IS NULL)
    OR EXISTS (
      SELECT 1 FROM (
        SELECT count(DISTINCT ps.playstyle_id) FILTER (WHERE ps.is_plus = false) AS normal_count,
          count(DISTINCT ps.playstyle_id) FILTER (WHERE ps.is_plus = true) AS plus_count
        FROM public.card_playstyles ps WHERE ps.card_id = c.id
      ) counts
      WHERE normal_count >= COALESCE(NULLIF(filters->>'minPlaystyles', '')::integer, 0)
        AND normal_count <= COALESCE(NULLIF(filters->>'maxPlaystyles', '')::integer, 2147483647)
        AND plus_count >= COALESCE(NULLIF(filters->>'minPlaystylesPlus', '')::integer, 0)
        AND plus_count <= COALESCE(NULLIF(filters->>'maxPlaystylesPlus', '')::integer, 2147483647)
    )
  )
  AND (
    COALESCE(jsonb_array_length(filters->'rarities'), 0) = 0
    OR filters->'rarities' ? CASE
      WHEN trim(c.version) ~* '^gold( common| rare)?$' THEN 'Gold'
      WHEN trim(c.version) ~* '^silver( common| rare)?$' THEN 'Silver'
      WHEN trim(c.version) ~* '^bronze( common| rare)?$' THEN 'Bronze'
      ELSE 'Special' END
  );
$function$;

REVOKE ALL ON FUNCTION public.filter_player_cards(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.filter_player_cards(jsonb) TO anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS card_positions_filter_card_idx ON public.card_positions (card_id, position_id);
CREATE INDEX IF NOT EXISTS card_roles_filter_card_idx ON public.card_roles (card_id, role_id, role_level);
CREATE INDEX IF NOT EXISTS card_playstyles_filter_card_idx ON public.card_playstyles (card_id, playstyle_id, is_plus);
CREATE INDEX IF NOT EXISTS card_versions_filter_overall_idx ON public.card_versions (overall DESC NULLS LAST, id);
NOTIFY pgrst, 'reload schema';
