# Timeline Scheduler Monorepo

Welcome to the **Timeline Scheduler** repository! This project is a monorepo designed to manage projects and tasks through an interactive timeline view and a Kanban board.

The application architecture is split into a modern **Angular** frontend and a high-performance serverless backend running on **Cloudflare Workers**.

---

## 🏗️ Architecture & Technologies

The project is structured as a monorepo managed with `pnpm` and a `Makefile` to automate common development workflows:

*   **Frontend (`/frontend`)**:
    *   **Framework**: [Angular 21](https://angular.dev/)
    *   **Features**: Interactive Timeline view, dynamic Kanban board, project and task management, user profile management panel, native multi-language support (English/Spanish), and access control using route guards and HTTP interceptors.
*   **Backend (`/backend`)**:
    *   **Environment**: [Cloudflare Workers](https://workers.cloudflare.com/) (Serverless)
    *   **API Framework**: [Hono](https://hono.dev/) with built-in OpenAPI schema and Swagger UI
    *   **Database**: [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite serverless database)
    *   **ORM**: [Drizzle ORM](https://orm.drizzle.team/)
    *   **Storage**: [Cloudflare R2](https://developers.cloudflare.com/r2/) for task file attachments
    *   **Security**: JWT-based authentication and a secure session management system utilizing Refresh Tokens
*   **Documentation (`/docs`)**:
    *   [Obsidian](https://obsidian.md/) workspace containing design notes, architecture graphs, and workflows.

---

## 🛠️ Prerequisites

Ensure you have the following installed in your local development environment:
*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [pnpm](https://pnpm.io/) (Default package manager, v11.x)
*   [Cloudflare Wrangler](https://developers.cloudflare.com/workers/wrangler/) (Installed globally or run via `npx`)

---

## 🚀 Quick Start Guide

Follow these steps to set up your local development environment.

### 1. Clone & Install Dependencies
Install all monorepo dependencies (both frontend and backend) in one step:
```bash
make install
```

### 2. Configure Local Database
Generate and apply database migrations to your local Cloudflare D1 (SQLite) development database, and populate it with initial seed data:
```bash
# Generate migrations based on the Drizzle schema
make db-generate

# Apply migrations to the local database
make db-migrate

# Populate with mock/seed data
make db-seed
```

### 3. Run Development Servers
Open two terminal windows to run both services locally:

*   **Start Backend API** (runs at `http://localhost:8787` and serves Swagger UI at `http://localhost:8787/ui`):
    ```bash
    make dev-backend
    ```
*   **Start Frontend App** (runs at `http://localhost:4200`):
    ```bash
    make dev-frontend
    ```

---

## 📖 Command Reference (`Makefile`)

The [Makefile](file:///Users/fmanzano/Projects/issues-views/Makefile) defines the following targets to streamline your workflow:

| Command | Description |
| :--- | :--- |
| `make install` | Installs all monorepo dependencies using `pnpm`. |
| `make dev-frontend` | Starts the Angular frontend development server (`http://localhost:4200`). |
| `make dev-backend` | Starts the Wrangler (Miniflare) local environment for the backend Worker (`http://localhost:8787`). |
| `make build-frontend` | Compiles the Angular frontend optimized for production. |
| `make db-generate` | Generates Drizzle migration files based on the schema definitions. |
| `make db-migrate` | Applies local D1 migrations to the local database instance. |
| `make db-migrate-prod` | Applies production D1 migrations to the remote Cloudflare database. |
| `make db-seed` | Seeds the local D1 database with test data from `drizzle/seed.sql`. |
| `make db-seed-prod` | Seeds the remote production D1 database with test data. |
| `make deploy-backend` | Deploys the backend Worker to Cloudflare. |
| `make typecheck-backend` | Performs TypeScript typechecking on the backend without compiling. |
| `make clean` | Cleans build artifacts (`dist/` directories) and caches. |
| `make help` | Displays the help menu with all available commands. |

---

## 🗄️ Database Schema

The relational database design utilizes Drizzle ORM and is composed of the following core entities:
*   `users`: User profiles with roles (`admin`/`user`), hashed passwords, and preferences.
*   `projects`: Projects with visualization configurations (color) and assigned owners.
*   `project_members`: Project membership mapping (Many-to-Many relationship).
*   `tasks`: Planned tasks featuring status, start dates, duration (in hours), and descriptions.
*   `task_dependencies`: Task execution order dependencies (Many-to-Many relationship).
*   `comments`: User discussion comments left under specific tasks.
*   `task_files`: File attachments linked to tasks and stored securely in the Cloudflare R2 bucket.
