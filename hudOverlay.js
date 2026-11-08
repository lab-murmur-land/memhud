'use strict';

const { Clutter, St } = imports.gi;
const Main = imports.ui.main;

var HUD_POSITIONS = [
    { id: 'top-start', label: 'Üst - Başlangıç (Sol Üst)' },
    { id: 'top-center', label: 'Üst - Orta (İnce Yatay)' },
    { id: 'top-end', label: 'Üst - Son (Sağ Üst)' },
    { id: 'right-center', label: 'Sağ - Orta (İnce Dikey)' },
    { id: 'bottom-end', label: 'Alt - Son (Sağ Alt)' },
    { id: 'bottom-center', label: 'Alt - Orta (İnce Yatay)' },
    { id: 'bottom-start', label: 'Alt - Başlangıç (Sol Alt)' },
    { id: 'left-center', label: 'Sol - Orta (İnce Dikey)' },
];

var HudOverlay = class HudOverlay {
    constructor(settings) {
        this._settings = settings;
        this._dragging = false;
        this._dragStartX = 0;
        this._dragStartY = 0;
        this._actorStartX = 0;
        this._actorStartY = 0;
        this._stageEventId = 0;
        this._monitorsChangedId = 0;
        this._allocationChangedId = 0;
        this._chromeAdded = false;

        this._buildUI();
        this._bindSignals();
        this._syncLayoutMode();
        this._syncChromeAndVisibility();
    }

    _getLayoutModeForPosition(posId) {
        if (posId === 'top-center' || posId === 'bottom-center')
            return 'horizontal-slim';
        if (posId === 'left-center' || posId === 'right-center')
            return 'vertical-slim';
        return 'corner';
    }

    _buildUI() {
        this._container = new St.BoxLayout({
            style_class: 'memory-hud-root',
            vertical: true,
            reactive: true,
            track_hover: true,
            can_focus: false,
        });

        this._buildCornerLayout();
        this._buildHorizontalSlimLayout();
        this._buildVerticalSlimLayout();

        this._container.add_child(this._cornerBox);
        this._container.add_child(this._hSlimBox);
        this._container.add_child(this._vSlimBox);

        // Drag support & middle-click position cycle
        this._container.connect('button-press-event', (actor, event) => {
            if (this._settings.get_boolean('click-through'))
                return Clutter.EVENT_PROPAGATE;

            const btn = event.get_button();
            if (btn === 2) {
                this.cyclePosition();
                return Clutter.EVENT_STOP;
            }
            if (btn !== 1)
                return Clutter.EVENT_PROPAGATE;

            const [stageX, stageY] = event.get_coords();
            this._dragging = true;
            this._dragStartX = stageX;
            this._dragStartY = stageY;
            this._actorStartX = this._container.x;
            this._actorStartY = this._container.y;

            this._stageEventId = global.stage.connect('captured-event', (stage, stageEvent) => {
                return this._onStageDragEvent(stageEvent);
            });

            return Clutter.EVENT_STOP;
        });
    }

    _buildCornerLayout() {
        this._cornerBox = new St.BoxLayout({
            style_class: 'memory-hud-overlay',
            vertical: true,
        });

        this._headerBox = new St.BoxLayout({
            style_class: 'memory-hud-header',
            vertical: false,
            x_expand: true,
        });

        this._titleLabel = new St.Label({
            text: 'MEMORY HUD',
            style_class: 'memory-hud-title',
            x_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._posCycleBtn = new St.Button({
            style_class: 'memory-hud-icon-btn',
            label: '⊹',
            reactive: true,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._posCycleBtn.connect('clicked', () => {
            this.cyclePosition();
        });

        this._closeBtn = new St.Button({
            style_class: 'memory-hud-icon-btn memory-hud-close-btn',
            label: '×',
            reactive: true,
            can_focus: false,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._closeBtn.connect('clicked', () => {
            this._settings.set_boolean('show-hud', false);
        });

        this._headerBox.add_child(this._titleLabel);
        this._headerBox.add_child(this._posCycleBtn);
        this._headerBox.add_child(this._closeBtn);
        this._cornerBox.add_child(this._headerBox);

        // RAM section
        const ramRow = new St.BoxLayout({
            style_class: 'memory-hud-metric-row',
            vertical: false,
            x_expand: true,
        });
        const ramTitle = new St.Label({
            text: 'RAM',
            style_class: 'memory-hud-metric-name',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._ramValueLabel = new St.Label({
            text: '-- / -- GB (--%)',
            style_class: 'memory-hud-metric-value',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        ramRow.add_child(ramTitle);
        ramRow.add_child(this._ramValueLabel);

        this._ramBarBg = new St.BoxLayout({
            style_class: 'memory-hud-bar-bg',
            x_expand: true,
        });
        this._ramBarFill = new St.Widget({
            style_class: 'memory-hud-bar-fill memory-hud-bar-normal',
            x_expand: false,
        });
        this._ramBarBg.add_child(this._ramBarFill);

        this._cornerBox.add_child(ramRow);
        this._cornerBox.add_child(this._ramBarBg);

        // SWAP section
        const swapRow = new St.BoxLayout({
            style_class: 'memory-hud-metric-row memory-hud-swap-row',
            vertical: false,
            x_expand: true,
        });
        const swapTitle = new St.Label({
            text: 'SWAP',
            style_class: 'memory-hud-metric-name',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._swapValueLabel = new St.Label({
            text: '-- / -- GB (--%)',
            style_class: 'memory-hud-metric-value',
            x_expand: true,
            x_align: Clutter.ActorAlign.END,
            y_align: Clutter.ActorAlign.CENTER,
        });
        swapRow.add_child(swapTitle);
        swapRow.add_child(this._swapValueLabel);

        this._swapBarBg = new St.BoxLayout({
            style_class: 'memory-hud-bar-bg',
            x_expand: true,
        });
        this._swapBarFill = new St.Widget({
            style_class: 'memory-hud-bar-fill memory-hud-bar-swap',
            x_expand: false,
        });
        this._swapBarBg.add_child(this._swapBarFill);

        this._cornerBox.add_child(swapRow);
        this._cornerBox.add_child(this._swapBarBg);
    }

    // Horizontal Slim Layout (top-center, bottom-center):
    // Tiny height, two bars side-by-side, only remaining free space on the right of each bar
    _buildHorizontalSlimLayout() {
        this._hSlimBox = new St.BoxLayout({
            style_class: 'memory-hud-hslim-box',
            vertical: false,
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._hSlimRamBarBg = new St.BoxLayout({
            style_class: 'memory-hud-hslim-bar-bg',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._hSlimRamBarFill = new St.Widget({
            style_class: 'memory-hud-hslim-bar-fill memory-hud-bar-normal',
        });
        this._hSlimRamBarBg.add_child(this._hSlimRamBarFill);

        this._hSlimRamFreeLabel = new St.Label({
            text: '--G',
            style_class: 'memory-hud-slim-free-label memory-hud-hslim-label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._hSlimSwapBarBg = new St.BoxLayout({
            style_class: 'memory-hud-hslim-bar-bg memory-hud-hslim-swap-bg',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._hSlimSwapBarFill = new St.Widget({
            style_class: 'memory-hud-hslim-bar-fill memory-hud-bar-swap',
        });
        this._hSlimSwapBarBg.add_child(this._hSlimSwapBarFill);

        this._hSlimSwapFreeLabel = new St.Label({
            text: '--G',
            style_class: 'memory-hud-slim-free-label memory-hud-hslim-label',
            y_align: Clutter.ActorAlign.CENTER,
        });

        this._hSlimBox.add_child(this._hSlimRamBarBg);
        this._hSlimBox.add_child(this._hSlimRamFreeLabel);
        this._hSlimBox.add_child(this._hSlimSwapBarBg);
        this._hSlimBox.add_child(this._hSlimSwapFreeLabel);
    }

    // Vertical Slim Layout (left-center, right-center):
    // Horizontally very thin, two vertical bars stacked one above the other, free space written below each
    _buildVerticalSlimLayout() {
        this._vSlimBox = new St.BoxLayout({
            style_class: 'memory-hud-vslim-box',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._vSlimRamBarBg = new St.BoxLayout({
            style_class: 'memory-hud-vslim-bar-bg',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._vSlimRamBarFill = new St.Widget({
            style_class: 'memory-hud-vslim-bar-fill memory-hud-bar-normal',
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        this._vSlimRamBarBg.add_child(this._vSlimRamBarFill);

        this._vSlimRamFreeLabel = new St.Label({
            text: '--G',
            style_class: 'memory-hud-slim-free-label memory-hud-vslim-label',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._vSlimSwapBarBg = new St.BoxLayout({
            style_class: 'memory-hud-vslim-bar-bg memory-hud-vslim-swap-bg',
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._vSlimSwapBarFill = new St.Widget({
            style_class: 'memory-hud-vslim-bar-fill memory-hud-bar-swap',
            y_expand: true,
            y_align: Clutter.ActorAlign.END,
        });
        this._vSlimSwapBarBg.add_child(this._vSlimSwapBarFill);

        this._vSlimSwapFreeLabel = new St.Label({
            text: '--G',
            style_class: 'memory-hud-slim-free-label memory-hud-vslim-label',
            x_align: Clutter.ActorAlign.CENTER,
        });

        this._vSlimBox.add_child(this._vSlimRamBarBg);
        this._vSlimBox.add_child(this._vSlimRamFreeLabel);
        this._vSlimBox.add_child(this._vSlimSwapBarBg);
        this._vSlimBox.add_child(this._vSlimSwapFreeLabel);
    }

    _syncLayoutMode() {
        const posId = this._normalizePositionId(this._settings.get_string('hud-position'));
        const mode = this._getLayoutModeForPosition(posId);

        this._cornerBox.visible = mode === 'corner';
        this._hSlimBox.visible = mode === 'horizontal-slim';
        this._vSlimBox.visible = mode === 'vertical-slim';
    }

    _onStageDragEvent(event) {
        if (!this._dragging)
            return Clutter.EVENT_PROPAGATE;

        const type = event.type();
        if (type === Clutter.EventType.MOTION) {
            const [stageX, stageY] = event.get_coords();
            const dx = stageX - this._dragStartX;
            const dy = stageY - this._dragStartY;
            this._container.set_position(
                Math.round(this._actorStartX + dx),
                Math.round(this._actorStartY + dy)
            );
            return Clutter.EVENT_STOP;
        } else if (type === Clutter.EventType.BUTTON_RELEASE) {
            this._stopDrag(true);
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _stopDrag(snapToNearest) {
        if (this._stageEventId) {
            global.stage.disconnect(this._stageEventId);
            this._stageEventId = 0;
        }
        if (!this._dragging)
            return;
        this._dragging = false;

        if (snapToNearest && this._container) {
            const nearest = this._findNearestPerimeterPosition(
                this._container.x,
                this._container.y
            );
            if (this._settings.get_string('hud-position') !== nearest)
                this._settings.set_string('hud-position', nearest);
            this._syncLayoutMode();
            this.updatePosition();
        }
    }

    _bindSignals() {
        this._allocationChangedId = this._container.connect('notify::allocation', () => {
            if (!this._dragging)
                this.updatePosition();
        });

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this.updatePosition();
        });
    }

    _syncChromeAndVisibility() {
        const showHud = this._settings.get_boolean('show-hud');
        const clickThrough = this._settings.get_boolean('click-through');

        if (this._chromeAdded) {
            Main.layoutManager.removeChrome(this._container);
            this._chromeAdded = false;
        }

        Main.layoutManager.addTopChrome(this._container, {
            affectsInputRegion: showHud && !clickThrough,
            affectsStruts: false,
            trackFullscreen: false,
        });
        this._chromeAdded = true;

        this._container.reactive = !clickThrough;
        this._posCycleBtn.visible = !clickThrough;
        this._closeBtn.visible = !clickThrough;
        this._container.visible = showHud;

        this._syncLayoutMode();
        this._raiseToTop();
        this.updatePosition();
    }

    _raiseToTop() {
        if (
            this._container &&
            Main.layoutManager.uiGroup &&
            Main.layoutManager.uiGroup.contains(this._container)
        ) {
            Main.layoutManager.uiGroup.set_child_above_sibling(this._container, null);
        }
    }

    _normalizePositionId(posId) {
        const map = {
            'top-left': 'top-start',
            'top-right': 'top-end',
            'bottom-left': 'bottom-start',
            'bottom-right': 'bottom-end',
        };
        const normalized = map[posId] || posId;
        const valid = HUD_POSITIONS.some(p => p.id === normalized);
        return valid ? normalized : 'top-end';
    }

    _getCoordinatesForPosition(posId) {
        const monitor = Main.layoutManager.primaryMonitor;
        if (!monitor)
            return { x: 0, y: 0 };

        const margin = 0;
        const slimMargin = 0;

        const w = this._container.width || 180;
        const h = this._container.height || 40;

        const xStart = monitor.x + margin;
        const xCenter = monitor.x + Math.round((monitor.width - w) / 2);
        const xEnd = monitor.x + monitor.width - w - margin;

        const yTop = monitor.y + margin;
        const yCenter = monitor.y + Math.round((monitor.height - h) / 2);
        const yBottom = monitor.y + monitor.height - h - margin;

        switch (posId) {
        case 'top-start':
            return { x: xStart, y: yTop };
        case 'top-center':
            return { x: xCenter, y: monitor.y + slimMargin };
        case 'top-end':
            return { x: xEnd, y: yTop };
        case 'right-center':
            return { x: monitor.x + monitor.width - w - slimMargin, y: yCenter };
        case 'bottom-end':
            return { x: xEnd, y: yBottom };
        case 'bottom-center':
            return { x: xCenter, y: monitor.y + monitor.height - h - slimMargin };
        case 'bottom-start':
            return { x: xStart, y: yBottom };
        case 'left-center':
            return { x: monitor.x + slimMargin, y: yCenter };
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

    cyclePosition() {
        const current = this._normalizePositionId(this._settings.get_string('hud-position'));
        const idx = HUD_POSITIONS.findIndex(p => p.id === current);
        const nextIdx = (idx + 1) % HUD_POSITIONS.length;
        this._settings.set_string('hud-position', HUD_POSITIONS[nextIdx].id);
    }

    updatePosition() {
        if (!this._container || this._dragging)
            return;

        const posId = this._normalizePositionId(this._settings.get_string('hud-position'));
        const { x, y } = this._getCoordinatesForPosition(posId);
        this._container.set_position(x, y);
        this._raiseToTop();
    }

    onSettingsChanged(key) {
        if (key === 'show-hud' || key === 'click-through') {
            this._syncChromeAndVisibility();
        } else if (key === 'hud-position' || key === 'hud-margin') {
            this._syncLayoutMode();
            this.updatePosition();
        }
    }

    updateStats(stats) {
        if (!stats || !this._container)
            return;

        // 1. Corner mode updates
        this._ramValueLabel.set_text(
            `${stats.ramUsedGB} / ${stats.ramTotalGB} GB (%${stats.ramPercent})`
        );
        if (stats.hasSwap) {
            this._swapValueLabel.set_text(
                `${stats.swapUsedGB} / ${stats.swapTotalGB} GB (%${stats.swapPercent})`
            );
        } else {
            this._swapValueLabel.set_text('0.0 / 0.0 GB (%0)');
        }

        const cornerBarWidth = Math.max(160, (this._ramBarBg.width || 195));
        const ramCornerW = Math.round((Math.min(100, Math.max(0, stats.ramPercent)) / 100) * cornerBarWidth);
        const swapCornerW = Math.round((Math.min(100, Math.max(0, stats.swapPercent)) / 100) * cornerBarWidth);

        this._ramBarFill.set_width(ramCornerW);
        this._swapBarFill.set_width(swapCornerW);

        const ramColorClass = this._getLevelClass(stats.ramPercent);
        const swapColorClass = this._getSwapLevelClass(stats.swapPercent);

        this._ramBarFill.style_class = `memory-hud-bar-fill ${ramColorClass}`;
        this._swapBarFill.style_class = `memory-hud-bar-fill ${swapColorClass}`;

        // 2. Horizontal Slim mode updates (top-center, bottom-center)
        const ramFreeText = `${stats.ramFreeGB}G`;
        const swapFreeText = stats.hasSwap ? `${stats.swapFreeGB}G` : '0.0G';
        this._hSlimRamFreeLabel.set_text(ramFreeText);
        this._hSlimSwapFreeLabel.set_text(swapFreeText);

        const hSlimBarWidth = 68;
        this._hSlimRamBarFill.set_width(Math.round((stats.ramPercent / 100) * hSlimBarWidth));
        this._hSlimSwapBarFill.set_width(Math.round((stats.swapPercent / 100) * hSlimBarWidth));
        this._hSlimRamBarFill.style_class = `memory-hud-hslim-bar-fill ${ramColorClass}`;
        this._hSlimSwapBarFill.style_class = `memory-hud-hslim-bar-fill ${swapColorClass}`;

        // 3. Vertical Slim mode updates (left-center, right-center)
        this._vSlimRamFreeLabel.set_text(ramFreeText);
        this._vSlimSwapFreeLabel.set_text(swapFreeText);

        const vSlimBarHeight = 50;
        this._vSlimRamBarFill.set_height(Math.round((stats.ramPercent / 100) * vSlimBarHeight));
        this._vSlimSwapBarFill.set_height(Math.round((stats.swapPercent / 100) * vSlimBarHeight));
        this._vSlimRamBarFill.style_class = `memory-hud-vslim-bar-fill ${ramColorClass}`;
        this._vSlimSwapBarFill.style_class = `memory-hud-vslim-bar-fill ${swapColorClass}`;

        this._raiseToTop();
    }

    _getLevelClass(pct) {
        if (pct >= 88)
            return 'memory-hud-bar-critical';
        if (pct >= 72)
            return 'memory-hud-bar-warning';
        return 'memory-hud-bar-normal';
    }

    _getSwapLevelClass(pct) {
        if (pct >= 80)
            return 'memory-hud-bar-critical';
        if (pct >= 50)
            return 'memory-hud-bar-warning';
        return 'memory-hud-bar-swap';
    }

    destroy() {
        this._stopDrag(false);

        if (this._allocationChangedId && this._container) {
            this._container.disconnect(this._allocationChangedId);
            this._allocationChangedId = 0;
        }

        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }

        if (this._chromeAdded && this._container) {
            Main.layoutManager.removeChrome(this._container);
            this._chromeAdded = false;
        }

        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
    }
};
