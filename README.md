# Applicant Records API

REST API kecil untuk menyimpan dan mengelola lamaran kerja atau magang. Proyek ini dibuat untuk memenuhi brief Sekolah Karir: membuat applicant record, menampilkan daftar, memperbarui tahap seleksi, dan memvalidasi input.

Dibangun dengan NestJS, TypeScript, Prisma, dan PostgreSQL. API dijalankan secara lokal menggunakan Docker Compose.

## Ruang lingkup

Satu record mewakili satu lamaran seseorang untuk satu posisi, bukan profil pelamar secara keseluruhan. Nama posisi disimpan sebagai teks; tidak ada katalog lowongan terpisah.

Yang tersedia:

- Membuat record lamaran.
- Melihat daftar dengan pagination dan filter tahap.
- Memperbarui tahap seleksi.
- Validasi field dan parameter request.

Autentikasi, pengelolaan lowongan, riwayat perubahan tahap, dan aturan perpindahan antar-tahap tidak termasuk dalam scope. Tahap dapat diperbarui ke nilai apa pun yang tersedia. Email tidak harus unik karena satu orang dapat mengajukan beberapa lamaran.

## Model data

Semua data disimpan pada tabel `applicants`.

| Field       | Tipe / aturan                                       |
| ----------- | --------------------------------------------------- |
| `id`        | UUID, primary key                                   |
| `fullName`  | `VARCHAR(100)`, wajib                               |
| `email`     | `VARCHAR(254)`, wajib, tidak unik                   |
| `position`  | `VARCHAR(120)`, wajib                               |
| `stage`     | Enum PostgreSQL `ApplicantStage`, default `APPLIED` |
| `createdAt` | `TIMESTAMPTZ(3)`, waktu record dibuat               |
| `updatedAt` | `TIMESTAMPTZ(3)`, diperbarui saat record diubah     |

Tahap seleksi yang didukung:

| Nilai       | Arti                                           |
| ----------- | ---------------------------------------------- |
| `APPLIED`   | Lamaran diterima; nilai awal untuk record baru |
| `SCREENING` | Peninjauan awal                                |
| `INTERVIEW` | Tahap wawancara                                |
| `OFFER`     | Penawaran diberikan                            |
| `HIRED`     | Pelamar direkrut                               |
| `REJECTED`  | Pelamar tidak melanjutkan proses               |

Skema ada di `prisma/schema.prisma`; migration database tersimpan di `prisma/migrations`.

## API

Base URL: `http://localhost:3000/api/v1`. Request dan response menggunakan JSON.

| Method  | Endpoint                | Keterangan                 |
| ------- | ----------------------- | -------------------------- |
| `POST`  | `/applicants`           | Membuat lamaran            |
| `GET`   | `/applicants`           | Menampilkan daftar lamaran |
| `PATCH` | `/applicants/:id/stage` | Mengubah tahap lamaran     |

### Membuat lamaran

Body hanya menerima `fullName`, `email`, dan `position`. Tahap awal selalu `APPLIED`.

```bash
curl.exe -i -X POST http://localhost:3000/api/v1/applicants -H "Content-Type: application/json" -d '{"fullName":"Andi Pratama","email":"andi@example.com","position":"Backend Engineer Intern"}'
```

Response `201 Created`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "Andi Pratama",
  "email": "andi@example.com",
  "position": "Backend Engineer Intern",
  "stage": "APPLIED",
  "createdAt": "2026-11-11T03:00:00.000Z",
  "updatedAt": "2026-11-11T03:00:00.000Z"
}
```

### Melihat daftar

Query parameter yang tersedia:

| Parameter | Default | Aturan                                         |
| --------- | ------: | ---------------------------------------------- |
| `page`    |     `1` | Bilangan bulat minimal 1                       |
| `limit`   |    `10` | Bilangan bulat 1–50                            |
| `stage`   |       — | Opsional; harus salah satu nilai tahap di atas |

Contoh request:

```text
GET /api/v1/applicants?page=1&limit=10&stage=INTERVIEW
```

Response `200 OK`:

```json
{
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "fullName": "Andi Pratama",
      "email": "andi@example.com",
      "position": "Backend Engineer Intern",
      "stage": "INTERVIEW",
      "createdAt": "2026-11-11T03:00:00.000Z",
      "updatedAt": "2026-11-11T04:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

Hasil diurutkan dari yang terbaru (`createdAt` descending, lalu `id` descending). `total` menghitung data yang cocok dengan filter. Jika tidak ada hasil, response tetap `200 OK` dengan `data: []` dan `totalPages: 0`. Jika `page` melewati halaman terakhir, `data` juga kosong.

### Memperbarui tahap

ID pada URL harus berupa UUID. Body wajib berisi nilai `stage` yang valid.

```bash
curl.exe -i -X PATCH http://localhost:3000/api/v1/applicants/550e8400-e29b-41d4-a716-446655440000/stage -H "Content-Type: application/json" -d '{"stage":"INTERVIEW"}'
```

Response `200 OK`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "fullName": "Andi Pratama",
  "email": "andi@example.com",
  "position": "Backend Engineer Intern",
  "stage": "INTERVIEW",
  "createdAt": "2026-11-11T03:00:00.000Z",
  "updatedAt": "2026-11-11T04:00:00.000Z"
}
```

### Validasi dan error

- `fullName` dan `position` di-trim, wajib berupa teks, dan panjangnya masing-masing 2–100 serta 2–120 karakter.
- `email` di-trim, diubah menjadi huruf kecil, harus berformat email, dan maksimal 254 karakter.
- Properti yang tidak dikenal ditolak. Field `stage` tidak boleh dikirim saat membuat record.
- Query `page` dan `limit` harus bilangan bulat dalam rentang yang ditentukan; `stage` harus enum yang valid.
- ID dengan format UUID yang salah menghasilkan `400 Bad Request`. UUID valid yang tidak ditemukan menghasilkan `404 Not Found`.

Contoh response validasi gagal (`400 Bad Request`):

```json
{
  "message": ["email must be an email"],
  "error": "Bad Request",
  "statusCode": 400
}
```

Error selain validasi yang tidak ditangani khusus menggunakan response standar NestJS `500 Internal Server Error`; detail internal tidak dikirim ke client.

## Menjalankan aplikasi

Prasyarat: Docker Desktop atau Docker Engine dengan Docker Compose.

Dari root repository, jalankan:

```bash
docker compose up --build
```

Compose akan menyiapkan PostgreSQL, menunggu database siap, menerapkan migration, lalu menjalankan API. Secara default API tersedia di `http://localhost:3000/api/v1` dan PostgreSQL di port `5433`. Untuk menghentikan service, gunakan `docker compose down`; volume database tetap tersimpan. Perintah `docker compose down -v` menghapus volume beserta datanya.

## Menjalankan test

Test dari host membutuhkan Node.js 22.12 atau lebih baru:

```bash
npm ci
npm run db:generate
npm test
npm run test:e2e
```

`npm test` menjalankan unit test service. Test e2e menguji endpoint HTTP, validasi, dan response dengan Prisma in-memory, sehingga tidak memerlukan database yang sedang berjalan. Prisma Client perlu dibuat lebih dulu menggunakan `npm run db:generate`.

## Penggunaan AI

AI digunakan untuk brainstorming, membantu debugging, dan membantu membuat file test karena cakupan test cukup banyak. Implementasi dan hasil akhirnya tetap menjadi tanggung jawab saya; saya meninjau dan memahami kode yang dikumpulkan.
