-- Executar como administrador do banco antes da migração inicial.
-- Conceder as roles às credenciais login da aplicação/migração fora deste arquivo.
DO $$ BEGIN
  CREATE ROLE enlace_runtime NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE enlace_migrator NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
GRANT USAGE ON SCHEMA public TO enlace_runtime, enlace_migrator;
GRANT CREATE ON SCHEMA public TO enlace_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE enlace_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO enlace_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE enlace_migrator IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO enlace_runtime;
-- Migration ledger remains private. Runner also revokes this if role setup follows migration.
DO $$ BEGIN
  IF to_regclass('public.enlace_migrations') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.enlace_migrations FROM enlace_runtime;
  END IF;
END $$;
