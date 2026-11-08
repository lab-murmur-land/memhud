UUID = memhud@lab.murmur.land
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
FILES = metadata.json extension.js memoryReader.js hudOverlay.js prefs.js stylesheet.css

.PHONY: all compile-schemas pack install uninstall enable disable run stop test

all: compile-schemas

compile-schemas:
	glib-compile-schemas --strict schemas/

pack: compile-schemas
	gnome-extensions pack --force --extra-source=memoryReader.js --extra-source=hudOverlay.js .

run:
	./standalone.js

stop:
	pkill -f "standalone.js" || true

install: compile-schemas
	mkdir -p $(INSTALL_DIR)/schemas
	cp $(FILES) $(INSTALL_DIR)/
	cp schemas/org.gnome.shell.extensions.memory-hud.gschema.xml $(INSTALL_DIR)/schemas/
	cp schemas/gschemas.compiled $(INSTALL_DIR)/schemas/
	@echo "Installed to $(INSTALL_DIR)"

uninstall:
	rm -rf $(INSTALL_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

test: compile-schemas
	gjs -c "imports.searchPath.unshift('.'); const { MemoryReader } = imports.memoryReader; const stats = new MemoryReader().read(); print('MemoryReader output:', JSON.stringify(stats)); if (!stats || !(stats.ramTotalKiB > 0)) throw new Error('Invalid stats');"
