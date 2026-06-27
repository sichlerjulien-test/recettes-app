-- Introspection canonique du schéma public — lecture seule, déterministe.
-- Produit 5 sections triées globalement : COL, CON, IDX, POL, RLS.
-- Utilisé pour vérifier prod == canonical (gate TK-15/TK-16).
-- Exécution locale : psql --csv -d <db> -f scripts/introspect-schema.sql

SELECT
  'COL ' || c.table_name || '.' || c.column_name
    || ' | ' || c.data_type
    || ' | udt=' || c.udt_name
    || ' | nullable=' || c.is_nullable
    || ' | default=' || COALESCE(c.column_default, '')
  AS line
FROM information_schema.columns c
WHERE c.table_schema = 'public'

UNION ALL

SELECT
  'CON ' || t.relname || ' | ' || pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class t ON t.oid = con.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'

UNION ALL

SELECT 'IDX ' || tablename || ' | ' || indexdef
FROM pg_indexes
WHERE schemaname = 'public'

UNION ALL

SELECT
  'POL ' || tablename || ' | ' || policyname
    || ' | cmd=' || cmd
    || ' | qual=' || COALESCE(qual, 'null')
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT 'RLS ' || c.relname || ' | enabled=' || c.relrowsecurity::text
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'

ORDER BY 1;
