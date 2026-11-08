'use strict';

const { Clutter, GLib, GObject, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const { MemoryReader } = Me.imports.memoryReader;
const { HudOverlay, HUD_POSITIONS } = Me.imports.hudOverlay;

const MemoryHudIndicator = GObject.registerClass(
class MemoryHudIndicator extends PanelMenu.Button {
    _init(settings) {
        super._init(0.0, 'Memory HUD Indicator', false);

        this._settings = settings;
        this._positionMenuItems = new Map();

        this._panelBox = new St.BoxLayout({
            style_class: 'panel-status-menu-box memory-hud-panel-box',
        });

        this._panelLabel = new St.Label({
            text: 'RAM: --/-- GB (--%)',
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'memory-hud-panel-label',
        });

        this._panelBox.add_child(this._panelLabel);
        this.add_child(this._panelBox);

        this._buildMenu();
    }

    _buildMenu() {
        // Live stats section in popup menu
        this._ramMenuItem = new PopupMenu.PopupMenuItem('RAM: -- / -- GB (--%)', {
            reactive: false,
            style_class: 'memory-hud-popup-stat',
        });
        this._swapMenuItem = new PopupMenu.PopupMenuItem('Swap: -- / -- GB (--%)', {
            reactive: false,
            style_class: 'memory-hud-popup-stat',
        });

        this.menu.addMenuItem(this._ramMenuItem);
        this.menu.addMenuItem(this._swapMenuItem);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Toggle Floating HUD
        this._showHudSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Floating HUD Göster (En Üst Katman)',
            this._settings.get_boolean('show-hud')
        );
        this._showHudSwitch.connect('toggled', (item, state) => {
            if (this._settings.get_boolean('show-hud') !== state)
                this._settings.set_boolean('show-hud', state);
        });
        this.menu.addMenuItem(this._showHudSwitch);

        // Toggle Click-through mode
        this._clickThroughSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Tıklamaları Arkaya Geçir (Click-through)',
            this._settings.get_boolean('click-through')
        );
        this._clickThroughSwitch.connect('toggled', (item, state) => {
            if (this._settings.get_boolean('click-through') !== state)
                this._settings.set_boolean('click-through', state);
        });
        this.menu.addMenuItem(this._clickThroughSwitch);

        // Toggle Swap in Top Panel
        this._showSwapInPanelSwitch = new PopupMenu.PopupSwitchMenuItem(
            'Üst Panelde Swap Göster',
            this._settings.get_boolean('show-swap-in-panel')
        );
        this._showSwapInPanelSwitch.connect('toggled', (item, state) => {
            if (this._settings.get_boolean('show-swap-in-panel') !== state)
                this._settings.set_boolean('show-swap-in-panel', state);
        });
        this.menu.addMenuItem(this._showSwapInPanelSwitch);

        // 8-Point Position Submenu
        this._posSubMenu = new PopupMenu.PopupSubMenuMenuItem('HUD Konumu (8 Nokta)');
        for (let i = 0; i < HUD_POSITIONS.length; i++) {
            const pos = HUD_POSITIONS[i];
            const item = new PopupMenu.PopupMenuItem(pos.label);
            item.connect('activate', () => {
                this._settings.set_string('hud-position', pos.id);
            });
            this._posSubMenu.menu.addMenuItem(item);
            this._positionMenuItems.set(pos.id, item);
        }
        this.menu.addMenuItem(this._posSubMenu);
        this._syncPositionMenuOrnament();

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        // Preferences button
        const prefsItem = new PopupMenu.PopupMenuItem('Ayarlar...');
        prefsItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(prefsItem);
    }

    _syncPositionMenuOrnament() {
        const currentPos = this._settings.get_string('hud-position');
        for (const [id, item] of this._positionMenuItems.entries()) {
            item.setOrnament(
                id === currentPos ? PopupMenu.Ornament.DOT : PopupMenu.Ornament.NONE
            );
        }
    }

    onSettingsChanged(key) {
        if (key === 'show-hud')
            this._showHudSwitch.setToggleState(this._settings.get_boolean('show-hud'));
        else if (key === 'click-through')
            this._clickThroughSwitch.setToggleState(this._settings.get_boolean('click-through'));
        else if (key === 'show-swap-in-panel')
            this._showSwapInPanelSwitch.setToggleState(this._settings.get_boolean('show-swap-in-panel'));
        else if (key === 'hud-position')
            this._syncPositionMenuOrnament();
    }

    updateStats(stats) {
        if (!stats)
            return;

        const showSwap = this._settings.get_boolean('show-swap-in-panel');
        const ramPart = `RAM: ${stats.ramUsedGB}/${stats.ramTotalGB} GB (%${stats.ramPercent})`;

        if (showSwap && stats.hasSwap) {
            const swapPart = `SWP: ${stats.swapUsedGB}/${stats.swapTotalGB} GB (%${stats.swapPercent})`;
            this._panelLabel.set_text(`${ramPart}  |  ${swapPart}`);
        } else {
            this._panelLabel.set_text(ramPart);
        }

        this._ramMenuItem.label.set_text(
            `RAM Kullanımı:  ${stats.ramUsedGB} / ${stats.ramTotalGB} GB (%${stats.ramPercent})`
        );
        if (stats.hasSwap) {
            this._swapMenuItem.label.set_text(
                `Swap Kullanımı: ${stats.swapUsedGB} / ${stats.swapTotalGB} GB (%${stats.swapPercent})`
            );
        } else {
            this._swapMenuItem.label.set_text('Swap Kullanımı: Yok (0.0 GB)');
        }
    }
});

class MemoryHudExtension {
    constructor() {
        this._settings = null;
        this._settingsSignalId = 0;
        this._reader = null;
        this._indicator = null;
        this._hud = null;
        this._timerId = 0;
    }

    enable() {
        this._settings = ExtensionUtils.getSettings(
            'org.gnome.shell.extensions.memory-hud'
        );
        this._reader = new MemoryReader();
        this._indicator = new MemoryHudIndicator(this._settings);
        Main.panel.addToStatusArea('memory-hud-indicator', this._indicator);

        this._hud = new HudOverlay(this._settings);

        this._settingsSignalId = this._settings.connect('changed', (settings, key) => {
            if (this._indicator)
                this._indicator.onSettingsChanged(key);
            if (this._hud)
                this._hud.onSettingsChanged(key);

            if (key === 'refresh-interval')
                this._restartTimer();
            else if (key === 'show-swap-in-panel')
                this._refresh();
        });

        this._refresh();
        this._restartTimer();
    }

    _refresh() {
        if (!this._reader)
            return;
        const stats = this._reader.read();
        if (!stats)
            return;

        if (this._indicator)
            this._indicator.updateStats(stats);
        if (this._hud)
            this._hud.updateStats(stats);
    }

    _restartTimer() {
        this._stopTimer();
        const interval = Math.max(1, this._settings.get_int('refresh-interval'));
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }

    _stopTimer() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
    }

    disable() {
        this._stopTimer();

        if (this._settings && this._settingsSignalId) {
            this._settings.disconnect(this._settingsSignalId);
            this._settingsSignalId = 0;
        }

        if (this._hud) {
            this._hud.destroy();
            this._hud = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._reader = null;
        this._settings = null;
    }
}

function init() {
    return new MemoryHudExtension();
}
