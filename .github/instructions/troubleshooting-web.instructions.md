---
applyTo: "**/*.{ts,tsx,js,jsx,json,env,md}"
---

# Troubleshooting Keseluruhan Web (Dynamic, No Hardcode)

Saat user meminta troubleshoot bug/error, selalu jalankan alur ini secara konsisten dan dinamis:

1. **Pahami arsitektur aktual dulu**
   - Petakan alur frontend → backend → database → auth → external API.
   - Jangan berasumsi dari implementasi lama; baca kondisi kode terbaru.

2. **Reproduksi dan kumpulkan bukti**
   - Reproduksi error dengan langkah yang jelas.
   - Ambil bukti objektif: log server, stack trace, status code, payload request/response, konfigurasi env yang relevan.

3. **Pisahkan symptom vs root cause**
   - Jelaskan gejala yang terlihat user.
   - Identifikasi akar masalah teknis yang memicu gejala tersebut.
   - Jika ada beberapa kandidat penyebab, validasi satu per satu dengan bukti.

4. **Perbaikan harus minim, tepat, dan lengkap**
   - Terapkan patch minimal yang menyelesaikan akar masalah, bukan sekadar menutup gejala.
   - Hindari perubahan tidak terkait.
   - **Dilarang hardcode** endpoint, API key, model, timeout, atau setting bisnis.
   - Semua konfigurasi harus dinamis (DB/env/admin config) sesuai arsitektur.

5. **Tangani mismatch skema DB dengan aman**
   - Jika issue berasal dari kolom/struktur DB, buat SQL migrasi yang aman.
   - Jelaskan kolom yang perlu ditambah/diubah dan dampaknya.

6. **Tambahkan guard anti-regresi**
   - Pastikan perbaikan aman untuk kode baru/fitur baru.
   - Pertahankan backward compatibility bila memungkinkan.

7. **Verifikasi wajib**
   - Jalankan lint/build/test yang tersedia.
   - Jika ada endpoint penting, lakukan smoke check end-to-end.

8. **Format laporan ke user (wajib)**
   - Root cause
   - Hal yang diperiksa
   - File yang diubah + alasan
   - Solusi yang diterapkan
   - Hasil verifikasi
   - Risiko tersisa + next action

9. **Gaya komunikasi**
   - Bahasa Indonesia yang jelas dan langsung ke poin.
   - Transparan terhadap batasan/unknown.
   - Jangan klaim sukses tanpa bukti verifikasi.
