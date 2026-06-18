# Konu Backend

Konu platformu için **bağımsız, güvenli** backend API. Web uygulamasından
tamamen ayrı, farklı sunucuya kurulabilir. PostgreSQL (kullanıcı verisi) +
MinIO (fotoğraf depolama).

> Bu backend sadece arayüze veri sağlar. Veritabanı şeması migration sistemi
> ile oluşturulur; gizli anahtarlar ve şifreler sadece ortam değişkenlerinden
> okunur — asla repoya işlenmez.

---

## Mimari

```
Web uygulamasi (Next.js)
        │  X-API-Key + (varsa) Bearer JWT
        ▼
┌───────────────────────────┐        ┌──────────────┐
│  Konu Backend (Express)   │───────▶│  PostgreSQL  │  kullanici, token, foto metadata
│  TypeScript · HTTPS-ready │        └──────────────┘
│  Helmet · CORS · RateLimit│        ┌──────────────┐
│  Zod validation           │───────▶│    MinIO     │  islenmis foto (public-read bucket)
└───────────────────────────┘        └──────────────┘
```

**İki katmanlı kimlik doğrulama:**
1. `X-API-Key` — servis anahtarı (tüm `/api/*` isteklerinde zorunlu)
2. `Authorization: Bearer <jwt>` — kullanıcı JWT'si (korumalı endpointlerde)

---

## Teknoloji

- **Express + TypeScript** (sıfır `any`, strict mode)
- **PostgreSQL** — `pg` ile raw SQL (ORM yok), UUID + TIMESTAMPTZ
- **MinIO** — S3-uyumlu, `@minio/minio-js`
- **Argon2id** — `@node-rs/argon2` (prebuilt, çapraz platform)
- **JWT RS256** — 4096-bit RSA, access 15dk / refresh 7gün (rotasyon + iptal)
- **sharp** — fotoğraf işleme (boyutlandırma, sıkıştırma)
- **zod** — giriş doğrulama
- **helmet · cors · express-rate-limit** — güvenlik katmanı

---

## Kurulum

### 1. Bağımlılıklar

```bash
cd backend
npm install
```

### 2. Ortam değişkenleri

`.env.example`'ı kopyalayın ve PostgreSQL + MinIO bilgilerini doldurun:

```bash
cp .env.example .env
```

Zorunlu (siz doldurun):
- `DATABASE_URL` — `postgresql://kullanici:sifre@host:5432/veritabani`
- `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_ENDPOINT`, `MINIO_PORT`
- `WEB_APP_ORIGIN` — web uygulamasının origin'i (CORS), örn. `https://app.konu.dev`

**Gizli anahtarlar gerekmez** — aşağıdaki `setup` onları otomatik üretir:
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` (RS256, 4096-bit)
- `SERVICE_API_KEY` (servis anahtarı)

### 3. İlk kurulum (setup)

```bash
npm run setup
```

Bu komut:
1. JWT RSA anahtar çifti üretir → `.env`'e yazar
2. Servis API anahtarı üretir → `.env`'e yazar
3. PostgreSQL'e bağlanır, migration'ları çalıştırır (`schema_migrations` takibiyle)
4. MinIO bucket oluşturur + public-read policy uygular
5. **Bağlantı adresini ve API anahtarını ekrana basar** ← web uygulamasına bunu verin

### 4. Çalıştırma

```bash
npm run dev      # geliştirme (tsx watch, canlı yeniden yükleme)
# veya
npm run build && npm start   # üretim
```

Sağlık kontrolü:
```bash
curl http://localhost:8080/api/health
curl http://localhost:8080/api/health/ready
```

---

## HTTPS

Üretimde TLS bir ters proxy (Nginx / Caddy) ile sonlandırılmalıdır. Backend
kendisi de HTTPS çalıştırabilir — `.env`'de `HTTPS_CERT` ve `HTTPS_KEY`
(dosya yolları) tanımlayın. Ters proxy arkasında `trust proxy` açık olduğundan
rate-limit gerçek IP'yi kullanır.

---

## API Endpoint'leri

> Tüm `/api/*` istekleri `X-API-Key` header'ı gerektirir.
> Korumalı endpointler ek olarak `Authorization: Bearer <accessToken>`.

### Auth
| Method | Yol                  | Auth | Açıklama                          |
|--------|----------------------|------|-----------------------------------|
| POST   | `/api/auth/register` | —    | Kayıt → user + access + refresh   |
| POST   | `/api/auth/login`    | —    | Giriş → user + access + refresh   |
| POST   | `/api/auth/refresh`  | —    | Refresh rotasyonu                 |
| POST   | `/api/auth/logout`   | —    | Refresh token iptal               |
| GET    | `/api/auth/me`       | JWT  | Mevcut kullanıcı                  |

### Users
| Method | Yol                     | Auth | Açıklama              |
|--------|-------------------------|------|-----------------------|
| GET    | `/api/users/:username`  | —    | Herkese açık profil   |
| GET    | `/api/users/me`         | JWT  | Tam profil            |
| PUT    | `/api/users/me`         | JWT  | Profil güncelle       |
| POST   | `/api/users/me/avatar`  | JWT  | Avatar yükle (multipart) |

### Photos
| Method | Yol             | Auth | Açıklama                              |
|--------|-----------------|------|---------------------------------------|
| POST   | `/api/photos`   | JWT  | Foto yükle (multipart) → işle + sakla |
| GET    | `/api/photos`   | JWT  | Kullanıcının fotoğrafları             |
| GET    | `/api/photos/:id` | —  | Foto metadata + URL                   |
| DELETE | `/api/photos/:id` | JWT | Foto sil (sadece sahip)               |

### Sağlık
| Method | Yol                | Açıklama              |
|--------|--------------------|-----------------------|
| GET    | `/api/health`      | Basit durum           |
| GET    | `/api/health/ready`| DB + MinIO kontrolü   |

---

## Fotoğraf Yükleme Akışı

1. İstemci → `POST /api/photos` (multipart, field `file`)
2. Backend, dosyayı belleğe alır (boyut limiti `UPLOAD_MAX_BYTES`)
3. **Magic bytes** ile gerçek içerik doğrulanır (jpeg/png/webp) → zararlı/desteklenmeyen dosya reddedilir
4. **sharp** ile işlenir:
   - En uzun kenar `PHOTO_MAX_DIMENSION` (varsayılan **1700px**) ile sınırlanır, oran korunur
   - Kalite korunarak sıkıştırılır (jpeg mozjpeg q85, png q85, webp q85)
5. İşlenmiş dosya MinIO'ya yazılır, metadata PostgreSQL'e kaydedilir
6. `photo` objesi (id, url, boyut, boyutlar) döner

---

## Güvenlik

- **Şifreler** asla düz metin saklanmaz — Argon2id (`password_hash`)
- **JWT RS256** — access 15dk, refresh 7gün; refresh rotasyonlu + DB'de iptal edilebilir
- **CORS** — sadece `WEB_APP_ORIGIN` origin'lerine izin
- **Rate limit** — login 5/dk/IP, register 5/saat/IP, yükleme 20/saat/kullanıcı, genel 300/15dk
- **Validation** — zod ile tüm girişler doğrulanır
- **Hata yönetimi** — iç detaylar sızdırılmaz, güvenli JSON yanıtı
- **Helmet** — güvenli HTTP header'ları
- **Dosya doğrulama** — uzantıya değil, magic bytes'e güvenilir
- **Gizli anahtarlar** — sadece ortam değişkenleri / `.env` (repoya işlenmez)

---

## Klasör Yapısı

```
backend/
├── src/
│   ├── config/env.ts          # zod ile doğrulanan ortam değişkenleri
│   ├── db/
│   │   ├── client.ts          # pg Pool + query/transaction
│   │   ├── migrate.ts         # migration runner (CLI)
│   │   └── migrations/        # .sql migration dosyaları
│   ├── lib/
│   │   ├── password.ts        # Argon2id
│   │   ├── jwt.ts             # RS256 sign/verify
│   │   ├── crypto.ts          # API key + token üretim/hash
│   │   ├── image.ts           # magic bytes + sharp işleme
│   │   ├── errors.ts          # HttpError ailesi
│   │   └── mappers.ts         # row → DTO
│   ├── storage/minio.ts       # MinIO client + bucket + URL
│   ├── middleware/            # apiKey, auth, rateLimit, cors, error, validate
│   ├── modules/
│   │   ├── auth/              # register, login, refresh, logout, me
│   │   ├── users/             # profil, güncelle, avatar
│   │   ├── photos/            # yükle, listele, getir, sil
│   │   └── health/
│   ├── setup/setup.ts         # ilk kurulum (anahtar üret + migrate + bucket)
│   ├── app.ts                 # Express app
│   └── index.ts               # sunucu başlatma
├── .env.example
├── Dockerfile
└── package.json
```

---

## Docker

```bash
docker build -t konu-backend .
docker run --env-file .env -p 8080:8080 konu-backend
```

Kurulumdan sonra: `docker run --env-file .env konu-backend npm run setup`

---

## Migration'lar

Yeni migration eklemek için `src/db/migrations/`'a sıralı bir `.sql` dosyası
ekleyin (örn. `002_add_posts.sql`) ve çalıştırın:

```bash
npm run migrate
```

Runner, `schema_migrations` tablosuyla uygulananları takip eder; her migration
tek bir transaction'da çalışır, hata olursa rollback.
