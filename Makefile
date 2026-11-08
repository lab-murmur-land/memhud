UUID = memhud@lab.murmur.land
INSTALL_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
STANDALONE_DIR = $(HOME)/.local/share/memhud
BIN_DIR = $(HOME)/.local/bin
SYSTEMD_USER_DIR = $(HOME)/.config/systemd/user
FILES = metadata.json extension.js memoryReader.js hudOverlay.js prefs.js stylesheet.css

.PHONY: all compile-schemas pack install uninstall enable disable install-service uninstall-service status-service run stop test

all: compile-schemas

compile-schemas:
	glib-compile-schemas --strict schemas/

pack: compile-schemas
	gnome-extensions pack --force --extra-source=memoryReader.js --extra-source=hudOverlay.js .

install: compile-schemas
	mkdir -p $(INSTALL_DIR)/schemas
	cp $(FILES) $(INSTALL_DIR)/
	cp schemas/org.gnome.shell.extensions.memory-hud.gschema.xml $(INSTALL_DIR)/schemas/
	cp schemas/gschemas.compiled $(INSTALL_DIR)/schemas/
	@echo "Installed GNOME extension to $(INSTALL_DIR)"

uninstall:
	rm -rf $(INSTALL_DIR)

enable:
	gnome-extensions enable $(UUID)

disable:
	gnome-extensions disable $(UUID)

install-service:
	mkdir -p $(BIN_DIR) $(SYSTEMD_USER_DIR)
	chmod +x $(STANDALONE_DIR)/standalone.js
	ln -sf $(STANDALONE_DIR)/standalone.js $(BIN_DIR)/memhud
	cp memhud.service $(SYSTEMD_USER_DIR)/memhud.service
	systemctl --user daemon-reload
	systemctl --user enable memhud.service
	systemctl --user restart memhud.service
	@echo "memhud.service installed, enabled, and started."

uninstall-service:
	systemctl --user disable --now memhud.service || true
	rm -f $(SYSTEMD_USER_DIR)/memhud.service $(BIN_DIR)/memhud
	systemctl --user daemon-reload || true
	@echo "memhud.service uninstalled."

status-service:
	systemctl --user status memhud.service --no-pager

run:
	./standalone.js

stop:
	pkill -f "standalone.js" || true

test: compile-schemas
	gjs -c "imports.searchPath.unshift('.'); const { MemoryReader } = imports.memoryReader; const stats = new MemoryReader().read(); print('MemoryReader output:', JSON.stringify(stats)); if (!stats || !(stats.ramTotalKiB > 0)) throw new Error('Invalid stats');"
