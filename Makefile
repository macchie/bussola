# Bussola suite. Requires node, npm, zip and, to publish, git and gh. Use on Linux or macOS.
APPS  := stiva correnti battiti radici registro bussola
REPO  := macchie/bussola
TAG   ?= suite-$(shell date +%Y.%-m.%-d)

.DEFAULT_GOAL := help
.PHONY: help setup sync test test-shared build catalog release versions check publish publish-manual bootstrap pages landing clean

help: ## Show the available commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-17s %s\n", $$1, $$2}'
	@echo "  make <setup|dev|test|build>-<app>   one app only, e.g. make dev-stiva"

node_modules: package-lock.json
	npm ci
	@touch $@

# Per-app targets delegate to each app's own Makefile, so the commands are the
# same whether you run them here or from inside the app folder.
setup: node_modules $(APPS:%=setup-%) ## Download the Neutralino runtime for every app

setup-%: node_modules
	@echo "== $*"; $(MAKE) -C $* setup

dev-%: node_modules ## Run one app in development (e.g. make dev-stiva)
	@$(MAKE) -C $* dev

sync: ## Copy shared translations and settings into every app
	@for a in $(APPS); do mkdir -p $$a/resources/shared; cp shared/*.js $$a/resources/shared/; done; echo "shared copied into every app"

test: test-shared $(APPS:%=test-%) ## Run the logic tests of every app

test-shared:
	@echo "== shared"; cd shared && node --test

test-%:
	@echo "== $*"; $(MAKE) -C $* test

build: node_modules $(APPS:%=build-%) ## Build the packages of every app

build-%: node_modules
	@echo "== $*"; $(MAKE) -C $* build

catalog: ## Prepare bussola/dist/release with packages and catalog (TAG=...)
	cd bussola && node scripts/publish.mjs $(TAG)

release: test build catalog ## Test, build and catalog, without publishing

versions: ## Show the version of every app
	@for a in $(APPS); do printf "%-11s %s\n" $$a $$(node -p "require('./$$a/neutralino.config.json').version"); done

check: ## Check that publishing is possible
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = master ] || { echo "Publish from the master branch"; exit 1; }
	@[ -z "$$(git status --porcelain)" ] || { echo "There are unsaved changes: commit them first"; exit 1; }
	@! git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null || { echo "Tag $(TAG) already exists: pick another with TAG=..."; exit 1; }
	@case "$(TAG)" in suite-*) ;; *) echo "The tag must start with suite-"; exit 1;; esac

publish: check test ## Create the tag: GitHub builds and publishes the release
	git tag -a $(TAG) -m "Suite $(TAG)"
	git push origin master $(TAG)
	@echo "Follow the publish run with: gh run watch --repo $(REPO)"

publish-manual: check release ## Publish from this computer, without GitHub Actions
	git tag -a $(TAG) -m "Suite $(TAG)"
	git push origin master $(TAG)
	gh release create $(TAG) bussola/dist/release/* --repo $(REPO) --title "$(TAG)" --latest --verify-tag

bootstrap: ## First time only: create the public repository and enable Pages
	git init -b master 2>/dev/null || true
	git add -A
	git diff --cached --quiet || git commit -m "Bussola suite"
	gh repo create $(REPO) --public --source=. --remote=origin --push
	$(MAKE) pages

pages: ## Set GitHub Pages to publish from Actions
	gh api -X POST repos/$(REPO)/pages -f build_type=workflow || gh api -X PUT repos/$(REPO)/pages -f build_type=workflow

landing: ## Open a preview of the landing at http://127.0.0.1:8000
	cd landing && python3 -m http.server 8000 --bind 127.0.0.1

clean: ## Remove packages and downloaded runtimes
	rm -rf node_modules $(APPS:%=%/dist) $(APPS:%=%/bin)
