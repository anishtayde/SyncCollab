-- usage: psql -v room=<room uuid> -v uid=<user uuid> -v n=<row count> -f seed.sql
-- inserts n fake snippets with random 768-dim vectors, then rebuilds the HNSW index
\timing on
SET max_parallel_maintenance_workers = 0;
SET maintenance_work_mem = '512MB';

DROP INDEX IF EXISTS snippets_embedding_idx;
DELETE FROM snippets WHERE title LIKE 'bench %';

INSERT INTO snippets (room_id, user_id, title, language, code, embedding)
SELECT :'room'::uuid, :'uid'::uuid, 'bench ' || s.i, 'typescript', 'bench code ' || s.i,
       (SELECT array_agg(random() - 0.5) FROM generate_series(1, 768) AS d(k) WHERE s.i > 0)::vector
FROM generate_series(1, :n) AS s(i);

ANALYZE snippets;
CREATE INDEX snippets_embedding_idx ON snippets USING hnsw (embedding vector_cosine_ops);
ANALYZE snippets;
\timing off
SELECT count(*) AS bench_rows FROM snippets WHERE title LIKE 'bench %';