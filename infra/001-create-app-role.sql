-- Run only by the official PostgreSQL image on a new empty data volume.
CREATE ROLE huoyoupu LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT format('ALTER ROLE huoyoupu PASSWORD %L', btrim(pg_read_file('/run/secrets/db_password'), E' \t\n\r')) \gexec
ALTER DATABASE huoyoupu OWNER TO huoyoupu;
