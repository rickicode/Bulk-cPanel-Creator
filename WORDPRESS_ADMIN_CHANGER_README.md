# WordPress Admin Changer

AI asisten backend untuk memproses daftar domain dan mengganti username/password admin WordPress secara otomatis melalui SSH dan WP-CLI.

## Fitur Utama

- **Interface Web yang User-Friendly**: Form input yang intuitif dengan validasi real-time
- **SSH Connection Testing**: Test koneksi SSH sebelum memulai proses
- **Domain Validation**: Validasi format domain dan deteksi duplikat
- **Real-time Progress Monitoring**: Monitor progress dengan logs dan statistik
- **Bulk Processing**: Proses multiple domain secara berurutan
- **Hasil Export**: Export hasil dalam format TXT
- **LocalStorage**: Simpan data input untuk kemudahan penggunaan

## Cara Kerja

### Proses Per Domain (Berurutan):

1. **Ambil Username cPanel**: Menggunakan WHM API untuk mendapatkan username cPanel dari domain
   ```bash
   whmapi1 listaccts | awk '/domain: DOMAIN_HERE/{found=1} found && /user:/{print $2; exit}'
   ```

2. **Ambil Username Admin WordPress**: Menggunakan WP-CLI untuk mendapatkan username admin WordPress
   ```bash
   wp user list --path=/home/USERNAME/public_html --role=administrator --field=user_login --allow-root
   ```

3. **Ganti Username dan Password**: Menggunakan WP-CLI untuk mengupdate credentials
   ```bash
   wp user update OLD_WP_USER --user_login=NEW_WP_USER --user_pass='NEW_WP_PASS' --path=/home/USERNAME/public_html --allow-root
   ```

## Input yang Diperlukan

### SSH Server Configuration
- **SSH Address**: Host server (contoh: server.example.com)
- **SSH Port**: Port SSH (default: 22)
- **SSH Username**: Username SSH (biasanya root)
- **SSH Password**: Password SSH

### WordPress Credentials Baru
- **Username WordPress Baru**: Username admin yang akan digunakan (contoh: ethwan)
- **Password WordPress Baru**: Password admin yang akan digunakan (contoh: Tomr1dle123@@AAA)

### Domain List
- Daftar domain yang akan diproses (satu domain per baris)

## Cara Penggunaan

1. **Akses Aplikasi**: Buka `http://localhost:3000/wordpress-admin-changer`

2. **Konfigurasi SSH Server**:
   - Isi SSH Address, Port, Username, dan Password
   - Klik "Test SSH Connection" untuk memastikan koneksi berhasil

3. **Set WordPress Credentials Baru**:
   - Masukkan username dan password WordPress yang diinginkan
   - Username dan password ini akan digunakan untuk semua domain

4. **Input Domain List**:
   - Masukkan daftar domain (satu per baris)
   - Klik "Validasi Domain" untuk memeriksa format dan duplikat

5. **Mulai Proses**:
   - Klik "Mulai Ganti Admin WordPress"
   - Monitor progress dan logs secara real-time
   - Proses dapat dihentikan kapan saja dengan tombol "Hentikan Proses"

6. **Hasil**:
   - Lihat hasil di section "Hasil Perubahan"
   - Export hasil dengan tombol "Export Hasil"

## API Endpoints

### WordPress Admin Changer
- `POST /api/wordpress/test-ssh` - Test koneksi SSH
- `POST /api/wordpress/start-changing` - Mulai proses perubahan
- `GET /api/wordpress/status/:processId` - Status proses
- `POST /api/wordpress/stop/:processId` - Hentikan proses

## Struktur Response

### Success Response
```json
{
  "domain": "example.com",
  "success": true,
  "cpanelUser": "examplu0",
  "oldWpUser": "admin_xyz",
  "newWpUser": "ethwan",
  "newWpPassword": "Tomr1dle123@@AAA"
}
```

### Error Response
```json
{
  "domain": "example.com",
  "success": false,
  "error": "Error message description"
}
```

## Teknologi yang Digunakan

### Backend
- **Node.js & Express**: Server dan API
- **node-ssh**: Koneksi SSH
- **winston**: Logging
- **joi**: Validasi input

### Frontend
- **HTML5 & CSS3**: Interface responsif
- **Vanilla JavaScript**: Interaktivity tanpa framework
- **LocalStorage**: Persistensi data
- **Real-time Polling**: Update progress

## Keamanan

- **Input Validation**: Validasi ketat pada semua input
- **SSH Credential Protection**: Password tidak di-log atau disimpan
- **Rate Limiting**: Pembatasan request API
- **Error Handling**: Penanganan error yang aman
- **Process Isolation**: Setiap proses terisolasi

## Monitoring & Logging

- **Real-time Logs**: Monitor setiap langkah proses
- **Progress Tracking**: Statistik processed/success/failed
- **Auto-scroll Logs**: Otomatis scroll ke log terbaru
- **Color-coded Messages**: Info/Success/Warning/Error dengan warna berbeda

## Error Handling

- **SSH Connection Errors**: Gagal koneksi SSH
- **Domain Not Found**: Domain tidak ditemukan di cPanel
- **WordPress Not Found**: WordPress tidak terinstall
- **Permission Errors**: Akses permission insufficient
- **WP-CLI Errors**: Command WP-CLI gagal

## Limitations

- Hanya mendukung WordPress yang diinstall di public_html
- Memerlukan WP-CLI terinstall di server
- Hanya bekerja dengan cPanel/WHM
- Proses dilakukan secara sequential (tidak parallel)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## Environment Variables

```env
NODE_ENV=development
PORT=3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

## Contoh Export Hasil

```
WordPress Admin Change Results - 12/30/2024, 4:30:00 PM
===============================================

Summary:
- Total domains: 3
- Successful: 2
- Failed: 1

Successful Changes:
==================
Domain: example1.com
cPanel User: exampl0
Old WordPress User: admin_abc
New WordPress User: ethwan
---
Domain: example2.com  
cPanel User: exampl1
Old WordPress User: admin_def
New WordPress User: ethwan
---

Failed Changes:
===============
Domain: example3.com
Error: WordPress not found at /home/exampl2/public_html
---
```

## Support

Untuk bantuan teknis atau bug report, silakan buat issue di repository ini atau hubungi tim development.

---
**Powered by HIJILABS Studios**