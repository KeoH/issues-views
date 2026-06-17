.PHONY: install build-frontend dev-backend dev-frontend db-generate db-migrate db-migrate-prod db-seed db-seed-prod deploy-backend typecheck-backend clean help

# Ayuda por defecto
help:
	@echo "Comandos disponibles en Timeline Scheduler Monorepo:"
	@echo "  make install             Instalar dependencias del monorepo"
	@echo "  make build-frontend      Compilar el frontend de Angular para producción"
	@echo "  make dev-backend         Levantar el servidor local de Wrangler (Miniflare)"
	@echo "  make dev-frontend        Levantar el servidor local del frontend (Angular)"
	@echo "  make db-generate         Generar archivos de migración de Drizzle a partir del esquema"
	@echo "  make db-migrate          Aplicar migraciones D1 locales en desarrollo"
	@echo "  make db-migrate-prod     Aplicar migraciones D1 remotas en producción"
	@echo "  make db-seed             Sembrar datos de prueba en la base de datos local D1"
	@echo "  make db-seed-prod        Sembrar datos de prueba en la base de datos remota D1 (Cloudflare)"
	@echo "  make deploy-backend      Desplegar el Worker/Backend en Cloudflare"
	@echo "  make typecheck-backend   Validar tipos TypeScript en el backend"
	@echo "  make clean               Limpiar directorios dist y node_modules"

# Instalar dependencias
install:
	pnpm install

# Compilar frontend
build-frontend:
	pnpm --filter frontend build

# Servidor de desarrollo del backend (Wrangler D1 + R2 + Queue)
dev-backend:
	pnpm --filter timeline-scheduler-backend dev

# Servidor de desarrollo del frontend (Angular)
dev-frontend:
	pnpm --filter frontend start

# Generar migraciones de base de datos
db-generate:
	pnpm --filter timeline-scheduler-backend db:generate

# Aplicar migraciones locales
db-migrate:
	pnpm --filter timeline-scheduler-backend db:migrate

# Aplicar migraciones en producción (Cloudflare D1)
db-migrate-prod:
	pnpm --filter timeline-scheduler-backend db:migrate:production

# Sembrar base de datos local
db-seed:
	pnpm --filter timeline-scheduler-backend wrangler d1 execute timeline-db --local --file=drizzle/seed.sql

# Sembrar base de datos remota en producción
db-seed-prod:
	pnpm --filter timeline-scheduler-backend wrangler d1 execute timeline-db --remote --file=drizzle/seed.sql

# Desplegar en Cloudflare
deploy-backend:
	pnpm --filter timeline-scheduler-backend deploy

# Validar tipos en el backend
typecheck-backend:
	npx -p typescript tsc --project backend/tsconfig.json --noEmit

# Limpiar compilaciones y cachés
clean:
	rm -rf frontend/dist backend/.wrangler backend/drizzle/migrations/.tsconfig.tsbuildinfo
