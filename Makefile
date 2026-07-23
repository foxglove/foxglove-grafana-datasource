PLUGIN_ID := foxglovedev-foxglove-datasource
VERSION    := $(shell node -p "require('./package.json').version")
DIST_DIR   := dist
ARCHIVE    := $(PLUGIN_ID)-$(VERSION).zip

.PHONY: all build build-frontend build-backend install dev server package clean

all: build

install:
	npm install

build-frontend:
	npm run build

build-backend:
	mage

build: build-frontend build-backend

dev:
	npm run dev

server: build
	docker compose up --build

package: build
	zip -r $(ARCHIVE) $(DIST_DIR)/
	@echo "Created $(ARCHIVE)"

clean:
	rm -rf $(DIST_DIR) $(PLUGIN_ID)-*.zip
