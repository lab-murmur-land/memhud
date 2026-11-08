# memhud — GNOME Shell Extension & Standalone HUD

**memhud** (`memhud@lab.murmur.land`), GNOME Shell (42–44) için hem **Üst Panel (Top Bar)** göstergesi hem de ekranın **en üst katmanında (tüm uygulamaların üzerinde)** çalışan **Floating HUD Overlay** sunan hafif bir bellek izleme aracıdır.

- **Author:** `lab.murmur.land`
- **Repository:** `git@github.com:lab-murmur-land/memhud.git`

## Tek Satırla Hızlı Kurulum (One-Liner)

Projeyi `$HOME/.local/share/memhud` dizinine klonlayıp **GNOME Shell eklentisini** kurmak için:

```bash
curl -fsSL https://raw.githubusercontent.com/lab-murmur-land/memhud/main/install.sh | sh
```

Sadece **Systemd User Service (`memhud.service`)** kurulumunu yapmak için (`--service`):

```bash
curl -fsSL https://raw.githubusercontent.com/lab-murmur-land/memhud/main/install.sh | sh -s -- --service
```

## Özellikler

- **Gerçek Zamanlı RAM & Swap Takibi**: `/proc/meminfo` üzerinden sıfır ek yükle kullanılan/toplam/boş GB ve yüzdelik (`%`) değerler.
- **En Üst Katman (Topmost Layer) Floating HUD**: Tüm uygulama ve tam ekran pencerelerin üzerinde görünür.
- **Konuma Göre Otomatik Şekil Değiştiren 8 Nokta Düzeni**:
  - **Üst Orta (`top-center`) & Alt Orta (`bottom-center`) — Yatay İnce Şerit**: Minicik yükseklikte yan yana iki ince bar ve sağlarında kalan boş (free) alan.
  - **Sol Orta (`left-center`) & Sağ Orta (`right-center`) — Dikey İnce Şerit**: Yatay olarak incecik dikey şeritte üst üste iki dikey bar ve altlarında kalan boş (free) alan.
  - **4 Köşe (`top-start`, `top-end`, `bottom-start`, `bottom-end`) — Detaylı Kart**: Kullanılan/toplam GB ve yüzdelik görünüm.
- **Sürükle-Bırak & Snap**: HUD'u fare ile sürükleyip bıraktığınızda en yakın kenar noktasına otomatik hizalanır ve şekil değiştirir.

## Manuel Kurulum

Projeyi `$HOME/.local/share/memhud` dizinine klonladıktan sonra:

### 1. GNOME Shell Eklentisi Kurulumu
```bash
make install
gnome-extensions enable memhud@lab.murmur.land
```

### 2. Systemd User Service Kurulumu (Autostart)
```bash
make install-service
```

Servis durumunu görmek veya kaldırmak için:
```bash
make status-service
make uninstall-service
```

### 3. Doğrudan Çalıştırma
```bash
make run
# Durdurmak için:
make stop
```
