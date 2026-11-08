#!/usr/bin/env gjs
'use strict';

imports.gi.versions.Gtk = '3.0';
imports.gi.versions.Gdk = '3.0';

const { Gdk, Gio, GLib, Gtk } = imports.gi;
const Cairo = imports.cairo;
const ByteArray = imports.byteArray;

// Resolve script directory (following symlinks) and import MemoryReader
function resolveScriptDir() {
    let path = imports.system.programInvocationName;
    try {
        while (GLib.file_test(path, GLib.FileTest.IS_SYMLINK)) {
            const target = GLib.file_read_link(path);
            if (GLib.path_is_absolute(target)) {
                path = target;
            } else {
                const parent = GLib.path_get_dirname(path);
                path = GLib.build_filenamev([parent, target]);
            }
        }
    } catch (e) {
        // Fallback to invocation path
    }
    const file = Gio.File.new_for_path(path);
    return file.get_parent() ? file.get_parent().get_path() : '.';
}

const scriptDir = resolveScriptDir();
imports.searchPath.unshift(scriptDir);

const { MemoryReader } = imports.memoryReader;

let AyatanaAppIndicator3 = null;
try {
    AyatanaAppIndicator3 = imports.gi.AyatanaAppIndicator3;
} catch (e) {
    // Optional indicator library
}

const HUD_POSITIONS = [
    { id: 'top-start', label: 'Üst - Başlangıç (Sol Üst)' },
    { id: 'top-center', label: 'Üst - Orta (İnce Yatay)' },
    { id: 'top-end', label: 'Üst - Son (Sağ Üst)' },
    { id: 'right-center', label: 'Sağ - Orta (İnce Dikey)' },
    { id: 'bottom-end', label: 'Alt - Son (Sağ Alt)' },
    { id: 'bottom-center', label: 'Alt - Orta (İnce Yatay)' },
    { id: 'bottom-start', label: 'Alt - Başlangıç (Sol Alt)' },
    { id: 'left-center', label: 'Sol - Orta (İnce Dikey)' },
];

class StandaloneHudApp {
    constructor() {
        this._reader = new MemoryReader();
        this._configPath = GLib.build_filenamev([
            GLib.get_user_config_dir(),
            'memory-hud-standalone.json',
        ]);
        this._config = {
            position: 'top-end',
            refreshInterval: 2,
            margin: 10,
            showHud: true,
        };
        this._loadConfig();

        this._dragging = false;
        this._dragOffsetX = 0;
        this._dragOffsetY = 0;
        this._timerId = 0;
        this._indicator = null;
        this._currentMode = null;
        this._ramPct = 0;
        this._swapPct = 0;
        this._lastStats = null;

        this._applyCss();
        this._buildWindow();
        this._buildIndicator();
        this._syncLayoutMode();
        this._refresh();
        this._restartTimer();
    }

    _loadConfig() {
        try {
            if (GLib.file_test(this._configPath, GLib.FileTest.EXISTS)) {
                const [ok, bytes] = GLib.file_get_contents(this._configPath);
                if (ok && bytes) {
                    const parsed = JSON.parse(ByteArray.toString(bytes));
                    Object.assign(this._config, parsed);
                }
            }
        } catch (e) {
            // Ignore malformed config
        }
    }

    _saveConfig() {
        try {
            GLib.file_set_contents(
                this._configPath,
                JSON.stringify(this._config, null, 2)
            );
        } catch (e) {
            // Ignore write errors
        }
    }

    _getLayoutModeForPosition(posId) {
        if (posId === 'top-center' || posId === 'bottom-center')
            return 'horizontal-slim';
        if (posId === 'left-center' || posId === 'right-center')
            return 'vertical-slim';
        return 'corner';
    }

    _applyCss() {
        const cssProvider = new Gtk.CssProvider();
        const css = `
            .hud-corner-box {
                background-color: rgba(16, 18, 24, 0.90);
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 12px;
                padding: 10px 14px;
            }
            .hud-hslim-box {
                background-color: rgba(16, 18, 24, 0.90);
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                padding: 3px 9px;
            }
            .hud-vslim-box {
                background-color: rgba(16, 18, 24, 0.90);
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                padding: 7px 4px;
            }
            .hud-title {
                color: rgba(160, 185, 255, 0.95);
                font-size: 9pt;
                font-weight: 700;
                letter-spacing: 1px;
            }
            .hud-btn {
                background: transparent;
                border: none;
                box-shadow: none;
                color: rgba(255, 255, 255, 0.70);
                font-weight: 700;
                font-size: 10pt;
                padding: 1px 6px;
                min-height: 18px;
                min-width: 18px;
                border-radius: 4px;
            }
            .hud-btn:hover {
                background-color: rgba(255, 255, 255, 0.16);
                color: #ffffff;
            }
            .hud-close-btn:hover {
                background-color: rgba(255, 82, 82, 0.25);
                color: #ff6b6b;
            }
            .hud-metric-name {
                color: rgba(255, 255, 255, 0.85);
                font-size: 9.5pt;
                font-weight: 700;
            }
            .hud-metric-val {
                color: #ffffff;
                font-family: monospace;
                font-size: 9.5pt;
                font-weight: 700;
            }
            .hud-slim-free {
                color: rgba(255, 255, 255, 0.92);
                font-family: monospace;
                font-size: 8pt;
                font-weight: 700;
            }
        `;
        cssProvider.load_from_data(ByteArray.fromString(css));
        Gtk.StyleContext.add_provider_for_screen(
            Gdk.Screen.get_default(),
            cssProvider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _buildWindow() {
        this._window = new Gtk.Window({
            type: Gtk.WindowType.TOPLEVEL,
            title: 'Memory HUD',
            decorated: false,
            resizable: false,
            app_paintable: true,
        });

        const screen = this._window.get_screen();
        const visual = screen.get_rgba_visual();
        if (visual && screen.is_composited())
            this._window.set_visual(visual);

        this._window.set_keep_above(true);
        this._window.stick();
        this._window.set_skip_taskbar_hint(true);
        this._window.set_skip_pager_hint(true);
        this._window.set_accept_focus(false);
        this._window.set_type_hint(Gdk.WindowTypeHint.DOCK);

        this._window.connect('realize', () => {
            const gdkWin = this._window.get_window();
            if (gdkWin)
                gdkWin.set_override_redirect(true);
        });

        this._window.connect('draw', (widget, cr) => {
            cr.setSourceRGBA(0, 0, 0, 0);
            cr.setOperator(Cairo.Operator.SOURCE);
            cr.paint();
            cr.setOperator(Cairo.Operator.OVER);
            return false;
        });

        this._eventBox = new Gtk.EventBox({
            visible_window: false,
        });
        this._eventBox.add_events(
            Gdk.EventMask.BUTTON_PRESS_MASK |
            Gdk.EventMask.BUTTON_RELEASE_MASK |
            Gdk.EventMask.POINTER_MOTION_MASK
        );

        this._rootWrapper = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
        });

        this._buildCornerLayout();
        this._buildHorizontalSlimLayout();
        this._buildVerticalSlimLayout();

        this._rootWrapper.pack_start(this._cornerBox, false, false, 0);
        this._rootWrapper.pack_start(this._hSlimBox, false, false, 0);
        this._rootWrapper.pack_start(this._vSlimBox, false, false, 0);

        this._eventBox.add(this._rootWrapper);
        this._window.add(this._eventBox);

        // Mouse interactions
        this._eventBox.connect('button-press-event', (widget, event) => {
            const [, button] = event.get_button();
            if (button === 3) {
                this._showContextMenu(event);
                return true;
            }
            if (button === 2) {
                this.cyclePosition();
                return true;
            }
            if (button === 1) {
                const [, rootX, rootY] = event.get_root_coords();
                const [winX, winY] = this._window.get_position();
                this._dragging = true;
                this._dragOffsetX = rootX - winX;
                this._dragOffsetY = rootY - winY;
                return true;
            }
            return false;
        });

        this._eventBox.connect('motion-notify-event', (widget, event) => {
            if (!this._dragging)
                return false;
            const [, rootX, rootY] = event.get_root_coords();
            this._window.move(
                Math.round(rootX - this._dragOffsetX),
                Math.round(rootY - this._dragOffsetY)
            );
            return true;
        });

        this._eventBox.connect('button-release-event', (widget, event) => {
            const [, button] = event.get_button();
            if (button === 1 && this._dragging) {
                this._dragging = false;
                const [winX, winY] = this._window.get_position();
                const nearest = this._findNearestPerimeterPosition(winX, winY);
                this.setPosition(nearest);
                return true;
            }
            return false;
        });

        this._window.connect('size-allocate', () => {
            if (!this._dragging)
                this.updatePosition();
        });

        this._window.show_all();
    }

    // 1. Corner Card Layout (top-start, top-end, bottom-start, bottom-end)
    _buildCornerLayout() {
        this._cornerBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 6,
            width_request: 235,
        });
        this._cornerBox.get_style_context().add_class('hud-corner-box');

        const headerBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 4,
        });
        const titleLabel = new Gtk.Label({
            label: 'MEMORY HUD',
            xalign: 0,
            hexpand: true,
        });
        titleLabel.get_style_context().add_class('hud-title');

        const cyclePosBtn = new Gtk.Button({
            label: '⊹',
            tooltip_text: 'Konumu Değiştir (8 Nokta)',
        });
        cyclePosBtn.get_style_context().add_class('hud-btn');
        cyclePosBtn.connect('clicked', () => {
            this.cyclePosition();
        });

        const closeBtn = new Gtk.Button({
            label: '×',
            tooltip_text: 'Kapat',
        });
        closeBtn.get_style_context().add_class('hud-btn');
        closeBtn.get_style_context().add_class('hud-close-btn');
        closeBtn.connect('clicked', () => {
            Gtk.main_quit();
        });

        headerBox.pack_start(titleLabel, true, true, 0);
        headerBox.pack_end(closeBtn, false, false, 0);
        headerBox.pack_end(cyclePosBtn, false, false, 0);
        this._cornerBox.pack_start(headerBox, false, false, 0);

        // RAM Row
        const ramRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        const ramLabel = new Gtk.Label({ label: 'RAM', xalign: 0 });
        ramLabel.get_style_context().add_class('hud-metric-name');
        this._cornerRamVal = new Gtk.Label({ label: '-- / -- GB (--%)', xalign: 1, hexpand: true });
        this._cornerRamVal.get_style_context().add_class('hud-metric-val');
        ramRow.pack_start(ramLabel, false, false, 0);
        ramRow.pack_end(this._cornerRamVal, true, true, 0);
        this._cornerBox.pack_start(ramRow, false, false, 0);

        this._cornerRamBar = new Gtk.DrawingArea({ height_request: 6 });
        this._cornerRamBar.connect('draw', (widget, cr) => {
            return this._drawHorizontalBar(widget, cr, this._ramPct, false);
        });
        this._cornerBox.pack_start(this._cornerRamBar, false, false, 0);

        // SWAP Row
        const swapRow = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            margin_top: 4,
        });
        const swapLabel = new Gtk.Label({ label: 'SWAP', xalign: 0 });
        swapLabel.get_style_context().add_class('hud-metric-name');
        this._cornerSwapVal = new Gtk.Label({ label: '-- / -- GB (--%)', xalign: 1, hexpand: true });
        this._cornerSwapVal.get_style_context().add_class('hud-metric-val');
        swapRow.pack_start(swapLabel, false, false, 0);
        swapRow.pack_end(this._cornerSwapVal, true, true, 0);
        this._cornerBox.pack_start(swapRow, false, false, 0);

        this._cornerSwapBar = new Gtk.DrawingArea({ height_request: 6 });
        this._cornerSwapBar.connect('draw', (widget, cr) => {
            return this._drawHorizontalBar(widget, cr, this._swapPct, true);
        });
        this._cornerBox.pack_start(this._cornerSwapBar, false, false, 0);
    }

    // 2. Horizontal Slim Layout (top-center, bottom-center):
    // Tiny height, two bars side-by-side, only remaining free space on the right of each bar
    _buildHorizontalSlimLayout() {
        this._hSlimBox = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            spacing: 6,
            valign: Gtk.Align.CENTER,
        });
        this._hSlimBox.get_style_context().add_class('hud-hslim-box');

        // Bar 1 (RAM) + Free space on its right
        this._hSlimRamBar = new Gtk.DrawingArea({
            width_request: 68,
            height_request: 5,
            valign: Gtk.Align.CENTER,
        });
        this._hSlimRamBar.connect('draw', (widget, cr) => {
            return this._drawHorizontalBar(widget, cr, this._ramPct, false);
        });

        this._hSlimRamFree = new Gtk.Label({
            label: '--G',
            valign: Gtk.Align.CENTER,
        });
        this._hSlimRamFree.get_style_context().add_class('hud-slim-free');

        // Bar 2 (SWAP) + Free space on its right
        this._hSlimSwapBar = new Gtk.DrawingArea({
            width_request: 68,
            height_request: 5,
            valign: Gtk.Align.CENTER,
            margin_start: 6,
        });
        this._hSlimSwapBar.connect('draw', (widget, cr) => {
            return this._drawHorizontalBar(widget, cr, this._swapPct, true);
        });

        this._hSlimSwapFree = new Gtk.Label({
            label: '--G',
            valign: Gtk.Align.CENTER,
        });
        this._hSlimSwapFree.get_style_context().add_class('hud-slim-free');

        this._hSlimBox.pack_start(this._hSlimRamBar, false, false, 0);
        this._hSlimBox.pack_start(this._hSlimRamFree, false, false, 0);
        this._hSlimBox.pack_start(this._hSlimSwapBar, false, false, 0);
        this._hSlimBox.pack_start(this._hSlimSwapFree, false, false, 0);
    }

    // 3. Vertical Slim Layout (left-center, right-center):
    // Horizontally very thin, two vertical bars stacked one above the other, free space written below each
    _buildVerticalSlimLayout() {
        this._vSlimBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 3,
            halign: Gtk.Align.CENTER,
        });
        this._vSlimBox.get_style_context().add_class('hud-vslim-box');

        // Top vertical bar (RAM) + free space below
        this._vSlimRamBar = new Gtk.DrawingArea({
            width_request: 6,
            height_request: 50,
            halign: Gtk.Align.CENTER,
        });
        this._vSlimRamBar.connect('draw', (widget, cr) => {
            return this._drawVerticalBar(widget, cr, this._ramPct, false);
        });

        this._vSlimRamFree = new Gtk.Label({
            label: '--G',
            halign: Gtk.Align.CENTER,
        });
        this._vSlimRamFree.get_style_context().add_class('hud-slim-free');

        // Bottom vertical bar (SWAP) + free space below
        this._vSlimSwapBar = new Gtk.DrawingArea({
            width_request: 6,
            height_request: 50,
            halign: Gtk.Align.CENTER,
            margin_top: 5,
        });
        this._vSlimSwapBar.connect('draw', (widget, cr) => {
            return this._drawVerticalBar(widget, cr, this._swapPct, true);
        });

        this._vSlimSwapFree = new Gtk.Label({
            label: '--G',
            halign: Gtk.Align.CENTER,
        });
        this._vSlimSwapFree.get_style_context().add_class('hud-slim-free');

        this._vSlimBox.pack_start(this._vSlimRamBar, false, false, 0);
        this._vSlimBox.pack_start(this._vSlimRamFree, false, false, 0);
        this._vSlimBox.pack_start(this._vSlimSwapBar, false, false, 0);
        this._vSlimBox.pack_start(this._vSlimSwapFree, false, false, 0);
    }

    _syncLayoutMode() {
        const mode = this._getLayoutModeForPosition(this._config.position);
        this._currentMode = mode;

        this._cornerBox.set_visible(mode === 'corner');
        this._cornerBox.set_no_show_all(mode !== 'corner');

        this._hSlimBox.set_visible(mode === 'horizontal-slim');
        this._hSlimBox.set_no_show_all(mode !== 'horizontal-slim');

        this._vSlimBox.set_visible(mode === 'vertical-slim');
        this._vSlimBox.set_no_show_all(mode !== 'vertical-slim');

        // Shrink window to minimum size of the active layout
        this._window.resize(1, 1);
    }

    _setBarColor(cr, pct, isSwap) {
        if (pct >= 88)
            cr.setSourceRGBA(1.0, 0.32, 0.32, 1.0); // Critical red
        else if (pct >= 72)
            cr.setSourceRGBA(0.96, 0.73, 0.23, 1.0); // Warning amber
        else if (isSwap)
            cr.setSourceRGBA(0.37, 0.66, 1.0, 1.0); // Swap blue
        else
            cr.setSourceRGBA(0.22, 0.83, 0.60, 1.0); // Normal green
    }

    _drawHorizontalBar(widget, cr, pct, isSwap) {
        const w = widget.get_allocated_width();
        const h = widget.get_allocated_height();
        const radius = h / 2;

        this._roundedRect(cr, 0, 0, w, h, radius);
        cr.setSourceRGBA(1, 1, 1, 0.15);
        cr.fill();

        const fillW = Math.max(0, Math.min(w, Math.round((pct / 100) * w)));
        if (fillW > 0) {
            this._roundedRect(cr, 0, 0, fillW, h, radius);
            this._setBarColor(cr, pct, isSwap);
            cr.fill();
        }
        return false;
    }

    _drawVerticalBar(widget, cr, pct, isSwap) {
        const w = widget.get_allocated_width();
        const h = widget.get_allocated_height();
        const radius = w / 2;

        this._roundedRect(cr, 0, 0, w, h, radius);
        cr.setSourceRGBA(1, 1, 1, 0.15);
        cr.fill();

        // Fill from bottom to top
        const fillH = Math.max(0, Math.min(h, Math.round((pct / 100) * h)));
        if (fillH > 0) {
            const yStart = h - fillH;
            this._roundedRect(cr, 0, yStart, w, fillH, radius);
            this._setBarColor(cr, pct, isSwap);
            cr.fill();
        }
        return false;
    }

    _roundedRect(cr, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        if (rad <= 0)
            return;
        cr.newSubPath();
        cr.arc(x + w - rad, y + rad, rad, -Math.PI / 2, 0);
        cr.arc(x + w - rad, y + h - rad, rad, 0, Math.PI / 2);
        cr.arc(x + rad, y + h - rad, rad, Math.PI / 2, Math.PI);
        cr.arc(x + rad, y + rad, rad, Math.PI, 3 * Math.PI / 2);
        cr.closePath();
    }

    _buildMenuWidget() {
        const menu = new Gtk.Menu();

        const posHeader = new Gtk.MenuItem({
            label: 'HUD Konumu (8 Nokta)',
            sensitive: false,
        });
        menu.append(posHeader);

        for (let i = 0; i < HUD_POSITIONS.length; i++) {
            const pos = HUD_POSITIONS[i];
            const prefix = this._config.position === pos.id ? '● ' : '   ';
            const item = new Gtk.MenuItem({ label: `${prefix}${pos.label}` });
            item.connect('activate', () => {
                this.setPosition(pos.id);
            });
            menu.append(item);
        }

        menu.append(new Gtk.SeparatorMenuItem());

        const toggleItem = new Gtk.MenuItem({
            label: this._config.showHud ? 'HUD Gizle' : 'HUD Göster',
        });
        toggleItem.connect('activate', () => {
            this._config.showHud = !this._config.showHud;
            this._saveConfig();
            if (this._config.showHud) {
                this._window.show();
                this._syncLayoutMode();
                this.updatePosition();
            } else {
                this._window.hide();
            }
            this._rebuildIndicatorMenu();
        });
        menu.append(toggleItem);

        const rateSubItem = new Gtk.MenuItem({ label: 'Yenileme Sıklığı' });
        const rateMenu = new Gtk.Menu();
        for (const sec of [1, 2, 5]) {
            const prefix = this._config.refreshInterval === sec ? '● ' : '   ';
            const rItem = new Gtk.MenuItem({ label: `${prefix}${sec} saniye` });
            rItem.connect('activate', () => {
                this._config.refreshInterval = sec;
                this._saveConfig();
                this._restartTimer();
                this._rebuildIndicatorMenu();
            });
            rateMenu.append(rItem);
        }
        rateSubItem.set_submenu(rateMenu);
        menu.append(rateSubItem);

        menu.append(new Gtk.SeparatorMenuItem());

        const quitItem = new Gtk.MenuItem({ label: 'Çıkış (Kapat)' });
        quitItem.connect('activate', () => {
            Gtk.main_quit();
        });
        menu.append(quitItem);

        menu.show_all();
        return menu;
    }

    _showContextMenu(event) {
        const menu = this._buildMenuWidget();
        menu.popup_at_pointer(event);
    }

    _buildIndicator() {
        if (!AyatanaAppIndicator3)
            return;
        try {
            this._indicator = AyatanaAppIndicator3.Indicator.new(
                'memory-hud-standalone',
                'utilities-system-monitor-symbolic',
                AyatanaAppIndicator3.IndicatorCategory.SYSTEM_SERVICES
            );
            this._indicator.set_status(AyatanaAppIndicator3.IndicatorStatus.ACTIVE);
            this._rebuildIndicatorMenu();
        } catch (e) {
            this._indicator = null;
        }
    }

    _rebuildIndicatorMenu() {
        if (!this._indicator)
            return;
        this._indicator.set_menu(this._buildMenuWidget());
    }

    _getCoordinatesForPosition(posId, customW, customH) {
        const display = Gdk.Display.get_default();
        const monitor = display.get_primary_monitor() || display.get_monitor(0);
        const geom = monitor.get_geometry();

        const [winW, winH] = this._window.get_size();
        const w = customW || winW;
        const h = customH || winH;
        const margin = 0;
        const slimMargin = 0;

        const xStart = geom.x + margin;
        const xCenter = geom.x + Math.round((geom.width - w) / 2);
        const xEnd = geom.x + geom.width - w - margin;

        const yTop = geom.y + margin;
        const yCenter = geom.y + Math.round((geom.height - h) / 2);
        const yBottom = geom.y + geom.height - h - margin;

        switch (posId) {
        case 'top-start':
            return { x: xStart, y: yTop };
        case 'top-center':
            return { x: xCenter, y: geom.y + slimMargin };
        case 'top-end':
            return { x: xEnd, y: yTop };
        case 'right-center':
            return { x: geom.x + geom.width - w - slimMargin, y: yCenter };
        case 'bottom-end':
            return { x: xEnd, y: yBottom };
        case 'bottom-center':
            return { x: xCenter, y: geom.y + geom.height - h - slimMargin };
        case 'bottom-start':
            return { x: xStart, y: yBottom };
        case 'left-center':
            return { x: geom.x + slimMargin, y: yCenter };
        default:
            return { x: xEnd, y: yTop };
        }
    }

    _findNearestPerimeterPosition(curX, curY) {
        let bestId = 'top-end';
        let bestDistSq = Number.MAX_SAFE_INTEGER;

        for (let i = 0; i < HUD_POSITIONS.length; i++) {
            const id = HUD_POSITIONS[i].id;
            const coords = this._getCoordinatesForPosition(id);
            const dx = curX - coords.x;
            const dy = curY - coords.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestId = id;
            }
        }
        return bestId;
    }

    setPosition(posId) {
        this._config.position = posId;
        this._saveConfig();
        this._syncLayoutMode();
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this.updatePosition();
            return GLib.SOURCE_REMOVE;
        });
        this._rebuildIndicatorMenu();
    }

    cyclePosition() {
        const idx = HUD_POSITIONS.findIndex(p => p.id === this._config.position);
        const nextIdx = (idx + 1) % HUD_POSITIONS.length;
        this.setPosition(HUD_POSITIONS[nextIdx].id);
    }

    updatePosition() {
        if (!this._window || this._dragging)
            return;
        const { x, y } = this._getCoordinatesForPosition(this._config.position);
        this._window.move(x, y);
        this._window.set_keep_above(true);
    }

    _refresh() {
        const stats = this._reader.read();
        if (!stats)
            return;
        this._lastStats = stats;

        // 1. Corner labels
        this._cornerRamVal.set_text(
            `${stats.ramUsedGB} / ${stats.ramTotalGB} GB (%${stats.ramPercent})`
        );
        if (stats.hasSwap) {
            this._cornerSwapVal.set_text(
                `${stats.swapUsedGB} / ${stats.swapTotalGB} GB (%${stats.swapPercent})`
            );
        } else {
            this._cornerSwapVal.set_text('0.0 / 0.0 GB (%0)');
        }

        // 2. Horizontal Slim labels (only remaining free space next to each bar)
        const ramFreeText = `${stats.ramFreeGB}G`;
        const swapFreeText = stats.hasSwap ? `${stats.swapFreeGB}G` : '0.0G';
        this._hSlimRamFree.set_text(ramFreeText);
        this._hSlimSwapFree.set_text(swapFreeText);

        // 3. Vertical Slim labels (only remaining free space below each vertical bar)
        this._vSlimRamFree.set_text(ramFreeText);
        this._vSlimSwapFree.set_text(swapFreeText);

        // Queue redraw on bars
        this._ramPct = stats.ramPercent;
        this._swapPct = stats.swapPercent;
        this._cornerRamBar.queue_draw();
        this._cornerSwapBar.queue_draw();
        this._hSlimRamBar.queue_draw();
        this._hSlimSwapBar.queue_draw();
        this._vSlimRamBar.queue_draw();
        this._vSlimSwapBar.queue_draw();

        if (this._indicator) {
            const label = stats.hasSwap
                ? `RAM: ${stats.ramUsedGB}/${stats.ramTotalGB}G (%${stats.ramPercent}) | SWP: %${stats.swapPercent}`
                : `RAM: ${stats.ramUsedGB}/${stats.ramTotalGB}G (%${stats.ramPercent})`;
            this._indicator.set_label(label, '');
        }

        this._window.set_keep_above(true);
    }

    _restartTimer() {
        if (this._timerId) {
            GLib.Source.remove(this._timerId);
            this._timerId = 0;
        }
        const interval = Math.max(1, this._config.refreshInterval || 2);
        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, interval, () => {
            this._refresh();
            return GLib.SOURCE_CONTINUE;
        });
    }
}

if (!GLib.getenv('DISPLAY') && !GLib.getenv('WAYLAND_DISPLAY'))
    GLib.setenv('DISPLAY', ':0', false);

const [initOk] = Gtk.init_check(null);
if (!initOk || !Gdk.Display.get_default()) {
    printerr('memhud: Display (DISPLAY / XAUTHORITY) is not ready yet. Exiting with 1 for systemd retry.\n');
    imports.system.exit(1);
}

new StandaloneHudApp();
Gtk.main();
