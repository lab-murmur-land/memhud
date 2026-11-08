# memhud — GNOME Shell Extension & Standalone HUD

**memhud** (`memhud@lab.murmur.land`), GNOME Shell (42–44) için hem **Üst Panel (Top Bar)** göstergesi hem de ekranın **en üst katmanında (tüm uygulamaların üzerinde)** çalışan **Floating HUD Overlay** sunan hafif bir bellek izleme aracıdır.

- **Author:** `lab.murmur.land`
- **Repository:** `git@github.com:lab-murmur-land/memhud.git`

## Özellikler

- **Gerçek Zamanlı RAM & Swap Takibi**: `/proc/meminfo` üzerinden sıfır ek yükle kullanılan/toplam/boş GB ve yüzdelik (`%`) değerler.
- **En Üst Katman (Topmost Layer) Floating HUD**: Tüm uygulama ve tam ekran pencerelerin üzerinde görünür.
- **Konuma Göre Otomatik Şekil Değiştiren 8 Nokta Düzeni**:
  - **Üst Orta (`top-center`) & Alt Orta (`bottom-center`) — Yatay İnce Şerit**: Minicik yükseklikte yan yana iki ince bar ve sağlarında kalan boş (free) alan.
  - **Sol Orta (`left-center`) & Sağ Orta (`right-center`) — Dikey İnce Şerit**: Yatay olarak incecik dikey şeritte üst üste iki dikey bar ve altlarında kalan boş (free) alan.
  - **4 Köşe (`top-start`, `top-end`, `bottom-start`, `bottom-end`) — Detaylı Kart**: Kullanılan/toplam GB ve yüzdelik görünüm.
- **Sürükle-Bırak & Snap**: HUD'u fare ile sürükleyip bıraktığınızda en yakın kenar noktasına otomatik hizalanır ve şekil değiştirir.

## Kurulum (GNOME Shell Eklentisi)

```bash
make install
gnome-extensions enable memhud@lab.murmur.land
```

## Bağımsız Masaüstü HUD Modu (`standalone.js`)

Eklenti kurulumunun kilitli olduğu sistemlerde veya doğrudan çalıştırmak için:

```bash
make run
# veya
./standalone.js
```

Durdurmak için HUD üzerindeki `×` butonuna tıklayabilir, sağ tık menüsünden **Çıkış** seçebilir veya `make stop` çalıştırabilirsiniz.
