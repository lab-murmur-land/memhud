'use strict';

const { Gio, Gtk } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;

const POSITIONS = [
    { id: 'top-start', label: 'Üst - Başlangıç (Sol Üst)' },
    { id: 'top-center', label: 'Üst - Orta' },
    { id: 'top-end', label: 'Üst - Son (Sağ Üst)' },
    { id: 'right-center', label: 'Sağ - Orta' },
    { id: 'bottom-end', label: 'Alt - Son (Sağ Alt)' },
    { id: 'bottom-center', label: 'Alt - Orta' },
    { id: 'bottom-start', label: 'Alt - Başlangıç (Sol Alt)' },
    { id: 'left-center', label: 'Sol - Orta' },
];

function init() {}

function _createRow(title, subtitle, controlWidget) {
    const rowBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 16,
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 12,
        margin_end: 12,
    });

    const textBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 2,
        hexpand: true,
        valign: Gtk.Align.CENTER,
    });

    const titleLabel = new Gtk.Label({
        label: `<b>${title}</b>`,
        use_markup: true,
        xalign: 0,
    });
    textBox.append(titleLabel);

    if (subtitle) {
        const subLabel = new Gtk.Label({
            label: subtitle,
            xalign: 0,
            css_classes: ['dim-label'],
        });
        textBox.append(subLabel);
    }

    controlWidget.valign = Gtk.Align.CENTER;
    rowBox.append(textBox);
    rowBox.append(controlWidget);
    return rowBox;
}

function buildPrefsWidget() {
    const settings = ExtensionUtils.getSettings(
        'org.gnome.shell.extensions.memory-hud'
    );

    const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        margin_top: 20,
        margin_bottom: 20,
        margin_start: 20,
        margin_end: 20,
    });

    // 1. Show Floating HUD Switch
    const showHudSwitch = new Gtk.Switch({
        active: settings.get_boolean('show-hud'),
    });
    settings.bind('show-hud', showHudSwitch, 'active', Gio.SettingsBindFlags.DEFAULT);
    mainBox.append(
        _createRow(
            'Floating HUD Göster',
            'Ekranın en üst katmanında (tüm uygulamaların üzerinde) bellek göstergesi',
            showHudSwitch
        )
    );

    // 2. 8-Point Position Selector
    const posCombo = new Gtk.ComboBoxText();
    for (let i = 0; i < POSITIONS.length; i++)
        posCombo.append(POSITIONS[i].id, POSITIONS[i].label);

    posCombo.set_active_id(settings.get_string('hud-position'));
    posCombo.connect('changed', combo => {
        const activeId = combo.get_active_id();
        if (activeId)
            settings.set_string('hud-position', activeId);
    });
    settings.connect('changed::hud-position', () => {
        posCombo.set_active_id(settings.get_string('hud-position'));
    });
    mainBox.append(
        _createRow(
            'HUD Konumu (8 Nokta)',
            'Ekran çevresinde start / center / end hizalaması',
            posCombo
        )
    );

    // 3. Click-through Switch
    const clickThroughSwitch = new Gtk.Switch({
        active: settings.get_boolean('click-through'),
    });
    settings.bind(
        'click-through',
        clickThroughSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    mainBox.append(
        _createRow(
            'Tıklamaları Arkaya Geçir (Click-through)',
            'Açık olduğunda fare tıklamaları HUD içinden altındaki pencerelere geçer',
            clickThroughSwitch
        )
    );

    // 4. Edge Margin SpinButton
    const marginSpin = Gtk.SpinButton.new_with_range(0, 120, 2);
    marginSpin.set_value(settings.get_int('hud-margin'));
    settings.bind('hud-margin', marginSpin, 'value', Gio.SettingsBindFlags.DEFAULT);
    mainBox.append(
        _createRow(
            'Ekran Kenar Boşluğu (px)',
            'Floating HUD ile ekran kenarları arasındaki mesafe',
            marginSpin
        )
    );

    // 5. Show Swap in Top Panel Switch
    const swapPanelSwitch = new Gtk.Switch({
        active: settings.get_boolean('show-swap-in-panel'),
    });
    settings.bind(
        'show-swap-in-panel',
        swapPanelSwitch,
        'active',
        Gio.SettingsBindFlags.DEFAULT
    );
    mainBox.append(
        _createRow(
            'Üst Panelde Swap Göster',
            'GNOME üst barında RAM yanında Swap kullanımını da göster',
            swapPanelSwitch
        )
    );

    // 6. Refresh Interval SpinButton
    const refreshSpin = Gtk.SpinButton.new_with_range(1, 60, 1);
    refreshSpin.set_value(settings.get_int('refresh-interval'));
    settings.bind(
        'refresh-interval',
        refreshSpin,
        'value',
        Gio.SettingsBindFlags.DEFAULT
    );
    mainBox.append(
        _createRow(
            'Yenileme Aralığı (Saniye)',
            'RAM ve Swap verilerinin güncellenme sıklığı',
            refreshSpin
        )
    );

    return mainBox;
}
