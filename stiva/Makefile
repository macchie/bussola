# Local development for this app, part of the Bussola suite.
# Dependencies live at the repo root: run `make setup` there once before building.
NEU := $(if $(wildcard node_modules/.bin/neu),node_modules/.bin/neu,../node_modules/.bin/neu)

.DEFAULT_GOAL := help
.PHONY: help setup sync dev test build clean

help: ## Show the available commands
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-8s %s\n", $$1, $$2}'

setup: ## Download the Neutralino runtime for this app
	@if [ -x bin/neutralino-linux_x64 ]; then echo "runtime present"; else $(NEU) update; fi

sync: ## Copy the shared code from ../shared into resources/shared
	@mkdir -p resources/shared && cp ../shared/*.js resources/shared/

dev: setup sync ## Run the app in development
	$(NEU) run

test: ## Run the logic tests
	node --test

build: setup sync ## Build the packages into dist/packages
	$(NEU) build && node scripts/package.mjs

clean: ## Remove build output and the downloaded runtime
	rm -rf dist bin
