.PHONY: help install build dev clean typecheck lint format test test-watch test-coverage \
       docker-build docker-run docker-dev docker-clean \
       studio-init medium-check talk \
       commission-run commission-list commission-validate \
       task-add task-list task-run \
       issue-run pipeline-run \
       branch-list technique-list repertoire-list \
       review-diff review-scan review-gate \
       analyze-codebase analyze-deps analyze-complexity analyze-migration \
       docs-audit docs-generate docs-knowledge docs-refresh \
       suggest-palette suggest-commission suggest-enhance \
       all check

# ============================================================
#  ATELIER - AI Agent Orchestration CLI
# ============================================================

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-24s\033[0m %s\n", $$1, $$2}'

# ------------------------------------------------------------
#  Setup & Build
# ------------------------------------------------------------

install: ## Install dependencies
	pnpm install

build: ## Build TypeScript
	pnpm build

dev: ## Run CLI in dev mode (tsx)
	pnpm dev -- $(ARGS)

clean: ## Remove build artifacts
	rm -rf dist

all: install build ## Install + Build

# ------------------------------------------------------------
#  Quality
# ------------------------------------------------------------

typecheck: ## Run TypeScript type check
	pnpm typecheck

lint: ## Run ESLint
	pnpm lint

format: ## Format code with Prettier
	pnpm format

test: ## Run tests
	pnpm test

test-watch: ## Run tests in watch mode
	pnpm test:watch

test-coverage: ## Run tests with coverage
	pnpm test:coverage

check: typecheck lint test ## Run all checks (typecheck + lint + test)

# ------------------------------------------------------------
#  Docker
# ------------------------------------------------------------

docker-build: ## Build Docker image
	docker compose build

docker-run: ## Run atelier in Docker (production)
	docker compose run --rm atelier $(ARGS)

docker-dev: ## Start dev container
	docker compose run --rm atelier-dev $(ARGS)

docker-clean: ## Remove Docker containers and images
	docker compose down --rmi local --volumes --remove-orphans

# ------------------------------------------------------------
#  Studio & Medium
# ------------------------------------------------------------

studio-init: ## Initialize .atelier/ in current project
	node bin/atelier.js studio init

medium-check: ## Check available AI CLI tools
	node bin/atelier.js medium check

medium-list: ## List configured mediums
	node bin/atelier.js medium list

# ------------------------------------------------------------
#  Interactive & Talk
# ------------------------------------------------------------

talk: ## Start interactive AI session
	node bin/atelier.js talk

# ------------------------------------------------------------
#  Commission
# ------------------------------------------------------------

commission-run: ## Run a commission (NAME=<name>)
	node bin/atelier.js commission run $(NAME)

commission-run-dry: ## Dry-run a commission (NAME=<name>)
	node bin/atelier.js commission run $(NAME) --dry-run

commission-run-pr: ## Run commission + auto PR (NAME=<name>)
	node bin/atelier.js commission run $(NAME) --auto-pr

commission-list: ## List available commissions
	node bin/atelier.js commission list

commission-validate: ## Validate commission YAML (NAME=<name>)
	node bin/atelier.js commission validate $(NAME)

# ------------------------------------------------------------
#  Task Queue
# ------------------------------------------------------------

task-add: ## Add task to queue (DESC=<description> [COMMISSION=<name>])
	node bin/atelier.js task add "$(DESC)" $(if $(COMMISSION),--commission $(COMMISSION))

task-list: ## List queued tasks
	node bin/atelier.js task list

task-run: ## Run all queued tasks
	node bin/atelier.js task run

task-remove: ## Remove task from queue (ID=<id>)
	node bin/atelier.js task remove $(ID)

# ------------------------------------------------------------
#  GitHub Issue
# ------------------------------------------------------------

issue-run: ## Run commission from GitHub Issue (NUM=<number> [COMMISSION=<name>])
	node bin/atelier.js issue run $(NUM) $(if $(COMMISSION),--commission $(COMMISSION))

issue-add: ## Add GitHub Issue to task queue (NUM=<number>)
	node bin/atelier.js issue add $(NUM)

# ------------------------------------------------------------
#  CI/CD Pipeline
# ------------------------------------------------------------

pipeline-run: ## Run in CI/CD mode (NAME=<name> [--auto-pr])
	node bin/atelier.js pipeline run $(NAME) $(ARGS)

pipeline-run-pr: ## Run in CI/CD mode with auto PR (NAME=<name>)
	node bin/atelier.js pipeline run $(NAME) --auto-pr

# ------------------------------------------------------------
#  Branch Management
# ------------------------------------------------------------

branch-list: ## List atelier branches
	node bin/atelier.js branch list

branch-merge: ## Merge branch (NAME=<name>)
	node bin/atelier.js branch merge $(NAME)

branch-delete: ## Delete branch (NAME=<name>)
	node bin/atelier.js branch delete $(NAME)

branch-retry: ## Retry branch (NAME=<name>)
	node bin/atelier.js branch retry $(NAME)

# ------------------------------------------------------------
#  Technique & Repertoire
# ------------------------------------------------------------

technique-list: ## List builtin commissions
	node bin/atelier.js technique list

technique-eject: ## Eject builtin to local (NAME=<name>)
	node bin/atelier.js technique eject $(NAME)

repertoire-add: ## Install repertoire from GitHub (URL=<url>)
	node bin/atelier.js repertoire add $(URL)

repertoire-list: ## List installed repertoires
	node bin/atelier.js repertoire list

repertoire-remove: ## Remove repertoire (NAME=<name>)
	node bin/atelier.js repertoire remove $(NAME)

# ------------------------------------------------------------
#  Logs
# ------------------------------------------------------------

log-show: ## Show execution log (ID=<run-id>)
	node bin/atelier.js log show $(ID)

log-tail: ## Show latest logs
	node bin/atelier.js log tail

# ------------------------------------------------------------
#  Review Gate (差分分析・セキュリティ・ポリシー)
# ------------------------------------------------------------

review-diff: ## Analyze diff and show risk score
	node bin/atelier.js review diff

review-scan: ## Run security scan (vulnerabilities + licenses + SBOM)
	node bin/atelier.js review scan

review-gate: ## Run full review gate (scan + diff + lint + policy)
	node bin/atelier.js review gate

# ------------------------------------------------------------
#  Analyze (コードベース分析・レガシー評価)
# ------------------------------------------------------------

analyze-codebase: ## Analyze codebase structure (PATH=<path>)
	node bin/atelier.js analyze codebase $(PATH)

analyze-deps: ## Analyze dependencies (PATH=<path>)
	node bin/atelier.js analyze dependencies $(PATH)

analyze-complexity: ## Analyze file complexity (FILE=<file>)
	node bin/atelier.js analyze complexity $(FILE)

analyze-migration: ## Generate migration plan (TARGET=<stack>)
	node bin/atelier.js analyze migration --target $(TARGET)

# ------------------------------------------------------------
#  Docs (ドキュメント管理)
# ------------------------------------------------------------

docs-audit: ## Check document freshness
	node bin/atelier.js docs audit

docs-generate: ## Generate docs from source (FILE=<file>)
	node bin/atelier.js docs generate $(FILE)

docs-knowledge: ## Collect knowledge from project
	node bin/atelier.js docs knowledge

docs-refresh: ## Run doc-refresh commission
	node bin/atelier.js docs refresh

# ------------------------------------------------------------
#  Suggest (プロンプト支援)
# ------------------------------------------------------------

suggest-palette: ## Suggest palette for task (DESC=<description>)
	node bin/atelier.js suggest palette "$(DESC)"

suggest-commission: ## Suggest commission for task (DESC=<description>)
	node bin/atelier.js suggest commission "$(DESC)"

suggest-enhance: ## Enhance a prompt (PROMPT=<text>)
	node bin/atelier.js suggest enhance "$(PROMPT)"
