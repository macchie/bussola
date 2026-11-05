# Suite Bussola. Richiede node, npm, zip e, per pubblicare, git e gh. Da usare su Linux o macOS.
APPS  := anelli correnti battiti scorte sentinelle radici registro bussola
REPO  := macchie/bussola
NEU   := $(CURDIR)/node_modules/.bin/neu
TAG   ?= suite-$(shell date +%Y.%-m.%-d)

.DEFAULT_GOAL := help
.PHONY: help setup sync test test-comune build catalog release versions check publish publish-manuale bootstrap pages landing clean

help: ## Mostra i comandi disponibili
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-17s %s\n", $$1, $$2}'

node_modules: package-lock.json
	npm ci
	@touch $@

setup: node_modules $(APPS:%=setup-%) ## Scarica il runtime Neutralino per ogni app

setup-%: node_modules
	@if [ -x "$*/bin/neutralino-linux_x64" ]; then echo "$*: runtime presente"; else echo "$*: scarico il runtime"; cd $* && $(NEU) update >/dev/null; fi

sync: ## Copia traduzioni e impostazioni condivise in tutte le app
	@for a in $(APPS); do mkdir -p $$a/resources/comune; cp comune/*.js $$a/resources/comune/; done; echo "comune copiato in tutte le app"

test: test-comune $(APPS:%=test-%) ## Esegue i test logici di tutte le app

test-comune:
	@echo "== comune"; cd comune && node --test

test-%:
	@echo "== $*"; cd $* && node --test

build: sync setup $(APPS:%=build-%) ## Crea i pacchetti di tutte le app

build-%: setup-%
	@echo "== $*"; cd $* && $(NEU) build >/dev/null && node scripts/package.mjs

catalog: ## Prepara bussola/dist/release con pacchetti e catalogo (TAG=...)
	cd bussola && node scripts/pubblica.mjs $(TAG)

release: test build catalog ## Test, build e catalogo, senza pubblicare

versions: ## Mostra la versione di ogni app
	@for a in $(APPS); do printf "%-11s %s\n" $$a $$(node -p "require('./$$a/neutralino.config.json').version"); done

check: ## Controlla che si possa pubblicare
	@[ "$$(git rev-parse --abbrev-ref HEAD)" = main ] || { echo "Pubblica dal ramo main"; exit 1; }
	@[ -z "$$(git status --porcelain)" ] || { echo "Ci sono modifiche non salvate: fai prima il commit"; exit 1; }
	@! git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null || { echo "Il tag $(TAG) esiste già: scegline un altro con TAG=..."; exit 1; }
	@case "$(TAG)" in suite-*) ;; *) echo "Il tag deve iniziare con suite-"; exit 1;; esac

publish: check test ## Crea il tag: GitHub compila e pubblica la release
	git tag -a $(TAG) -m "Suite $(TAG)"
	git push origin main $(TAG)
	@echo "Segui la pubblicazione con: gh run watch --repo $(REPO)"

publish-manuale: check release ## Pubblica da questo computer, senza GitHub Actions
	git tag -a $(TAG) -m "Suite $(TAG)"
	git push origin main $(TAG)
	gh release create $(TAG) bussola/dist/release/* --repo $(REPO) --title "$(TAG)" --latest --verify-tag

bootstrap: ## Solo la prima volta: crea il repository pubblico e attiva Pages
	git init -b main 2>/dev/null || true
	git add -A
	git diff --cached --quiet || git commit -m "Suite Bussola"
	gh repo create $(REPO) --public --source=. --remote=origin --push
	$(MAKE) pages

pages: ## Imposta GitHub Pages sulla pubblicazione da Actions
	gh api -X POST repos/$(REPO)/pages -f build_type=workflow || gh api -X PUT repos/$(REPO)/pages -f build_type=workflow

landing: ## Apre un'anteprima della landing su http://127.0.0.1:8000
	cd landing && python3 -m http.server 8000 --bind 127.0.0.1

clean: ## Toglie pacchetti e runtime scaricati
	rm -rf node_modules $(APPS:%=%/dist) $(APPS:%=%/bin)
