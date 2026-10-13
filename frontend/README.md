# AMIGA Intake

Aplikasi intake dokumen hybrid dengan **antarmuka terpisah untuk setiap peran** (PIC Klien, Intake Support,
Finance Reviewer, Service Lead, System Admin). Dibangun dengan Next.js 14 (App Router), TypeScript,
dan Amazon Bedrock untuk ekstraksi invoice.

## Dokumentasi

BPMN, matriks RBAC, user story, catatan update login, dan prototipe satu file ada di folder [`docs/`](docs/README.md).

## Menjalankan lokal

Butuh Node.js 18.18 atau lebih baru.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Buka http://localhost:3000. Halaman utamanya adalah login (email dan kata sandi). Untuk mencoba, buka panel "Akun contoh" lalu pilih salah satu, atau ketik manual: `dewi@amiga.demo`, `eko@`, `andi@`, `rina@`, `hana@`, `bayu@`, `sari@` (semuanya `@amiga.demo`) dengan kata sandi `amiga2026`. Tanpa `BEDROCK_MODEL_ID`, ekstraksi memakai mode simulasi,
jadi tidak perlu kredensial AWS. Sebelum push, jalankan `npm run typecheck` dan `npm run build` sekali,
lalu commit file `package-lock.json` yang dibuat `npm install`.

## Push ke GitHub

```bash
git init && git add . && git commit -m "AMIGA Intake"
git branch -M main
git remote add origin git@github.com:<akun>/<repo>.git
git push -u origin main
```

`.env.local` sudah masuk `.gitignore`. Jangan commit rahasia.

## Struktur

```
src/
  middleware.ts          wajib punya sesi sah (lapis 1)
  lib/
    constants.ts         peran, menu, dan teks batasan per peran
    rbac.ts              matriks izin, pemeriksaan cakupan, pemisahan tugas (lapis 2)
    services.ts          SEMUA akses data. Memanggil guard() sebelum menyentuh data,
                         dan mengembalikan bentuk data berbeda per peran (lapis 3)
    actions.ts           Server Actions, tipis, memanggil services
    bedrock.ts           ekstraksi invoice (Bedrock Converse API atau simulasi)
    auth.ts              verifikasi email dan kata sandi, pembatasan percobaan
    password.ts          hash kata sandi (scrypt + salt)
    session.ts           sesi cookie JWT (DEMO, ganti dengan Cognito)
    store.ts             data contoh di memori (ganti dengan database)
  app/
    page.tsx             halaman utama = login; yang sudah masuk diarahkan ke ruang kerjanya
    login/               alamat lama, dialihkan ke /
    pic/ support/ finance/ lead/ admin/
                         satu folder per peran, masing-masing punya layout, menu, dan halaman sendiri
    api/docs/[id]/file   PDF asli, dicek ulang per peran dan cakupan
  components/            komponen UI
```

Route sebuah peran hanya bisa dibuka oleh peran itu. Peran lain dialihkan ke ruang kerjanya sendiri.

## Login

- Kata sandi disimpan sebagai hash scrypt dengan salt, dibandingkan dengan `timingSafeEqual`.
- Pesan galat generik ("Email atau kata sandi salah") agar tidak membocorkan email yang terdaftar.
- Setelah 5 kali gagal, email dikunci 1 menit. Percobaan gagal dan penguncian tercatat di riwayat audit System Admin.
- Sesi memakai cookie `httpOnly`, `sameSite=lax`, dan `secure` di produksi, berlaku 8 jam.
- Akun dan kata sandi contoh hanya tampil bila `DEMO_MODE` tidak `off`. **Setel `DEMO_MODE=off` di produksi.**
- Belum ada: pengingat sesi habis, MFA, dan alur atur ulang kata sandi mandiri. Semuanya tersedia bila memakai Amazon Cognito.

## RBAC

| Peran | Antrean | Riwayat audit |
| --- | --- | --- |
| PIC Klien | dokumen klien yang ia miliki | peristiwa dokumen itu |
| Intake Support | klien dalam delegasi aktif | peristiwa klien itu |
| Finance Reviewer | tugas yang ditugaskan kepadanya | peristiwa tugas itu |
| Service Lead | status dan penugasan semua tugas, tanpa isi dokumen | catatan beban kerja |
| System Admin | permintaan akses | perubahan akun, delegasi, dan akses yang ditolak |

Aturan: tolak secara default, cakupan data dicek per record, Finance Reviewer tidak bisa meninjau dokumen
yang ia unggah sendiri, pencabutan delegasi berlaku seketika, dan setiap penolakan tercatat.
Robot Admin dan Client Approver tidak punya antarmuka.

## Amazon Bedrock

Bedrock dipakai untuk **ekstraksi AI**, bukan tempat menjalankan aplikasi. Aplikasi ini berjalan di AWS Amplify
(atau ECS/App Runner), dan memanggil Bedrock dari sisi server lewat `src/lib/bedrock.ts`.

1. Di konsol Bedrock, aktifkan akses ke model yang mendukung input dokumen PDF lewat Converse API.
2. Isi `BEDROCK_REGION` dan `BEDROCK_MODEL_ID` (model ID atau inference profile yang aktif di akun Anda).
3. Pastikan peran IAM yang menjalankan aplikasi punya izin berikut:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["bedrock:InvokeModel"],
    "Resource": "*"
  }]
}
```

Persempit `Resource` ke ARN model atau inference profile yang Anda pakai.

Untuk uji lokal dengan Bedrock sungguhan, jalankan `aws configure` (atau set `AWS_PROFILE`) lalu isi `BEDROCK_MODEL_ID`.

## Deploy ke AWS Amplify Hosting

1. Push repo ke GitHub.
2. Amplify Console, **Create new app**, pilih **GitHub**, pilih repo dan branch `main`. Amplify mendeteksi Next.js
   dan memakai `amplify.yml` di repo ini.
3. Di **Environment variables**, isi `AUTH_SECRET` (buat dengan `openssl rand -base64 48`), `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, dan `DEMO_MODE=off`.
4. Di **App settings, IAM roles, Compute role**, pasang peran IAM dengan izin Bedrock di atas.
   Tanpa ini, server tidak punya kredensial untuk memanggil Bedrock.
5. Deploy. Setiap push ke `main` memicu build baru.

## Yang harus diganti sebelum produksi

Prototipe ini sengaja memakai data contoh supaya mudah dijalankan. Untuk produksi:

- **Login**: ganti `session.ts` dengan Amazon Cognito (OIDC), petakan grup Cognito ke peran.
- **Data**: ganti `store.ts` dengan DynamoDB atau RDS. Data di memori hilang saat restart dan tidak dibagi antar instance serverless,
  jadi hasil unggahan bisa tidak muncul di instance lain.
- **File PDF**: simpan di S3 dengan enkripsi, bukan di memori.
- **Pemisahan tugas dan cakupan** harus tetap dicek di `services.ts` pada setiap query, dan filter record sebaiknya
  ikut masuk ke query database supaya data di luar cakupan tidak pernah dibaca.
- Tambahkan rate limiting, batas ukuran file, dan pemindaian berkas.
