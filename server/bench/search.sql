-- usage: psql -v room=<room uuid> -f search.sql
-- a fresh random query vector, stored as text in the psql variable qv
SELECT (SELECT array_agg(random() - 0.5) FROM generate_series(1, 768))::vector::text AS qv \gset

\echo ===== EXACT search (index disabled) =====
SET enable_indexscan = off;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM snippets
WHERE room_id = :'room'::uuid
ORDER BY embedding <=> :'qv'::vector
LIMIT 5;

CREATE TEMP TABLE exact_ids AS
SELECT id FROM snippets WHERE room_id = :'room'::uuid
ORDER BY embedding <=> :'qv'::vector LIMIT 10;
RESET enable_indexscan;

\echo ===== HNSW index search =====
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM snippets
WHERE room_id = :'room'::uuid
ORDER BY embedding <=> :'qv'::vector
LIMIT 5;

CREATE TEMP TABLE approx_ids AS
SELECT id FROM snippets WHERE room_id = :'room'::uuid
ORDER BY embedding <=> :'qv'::vector LIMIT 10;

\echo ===== Recall spot check: how many of the true top 10 did HNSW return? =====
SELECT count(*) AS overlap_out_of_10 FROM exact_ids JOIN approx_ids USING (id);