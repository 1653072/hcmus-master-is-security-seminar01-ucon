# UCON Movie Platform

HCMUS Master — Information Security Seminar 01  
Demonstration of **Usage Control (UCON)** applied to an online movie rental platform.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [UCON Policy Engine](#ucon-policy-engine)
5. [API Endpoints](#api-endpoints)
6. [Demo Flows](#demo-flows)
7. [Quick Start](#quick-start)
8. [Project Structure](#project-structure)
9. [Demo Credentials](#demo-credentials)
10. [Known Limitations](#known-limitations)

---

## Overview

This application implements the movie rental platform described in `CONTENT_V2.md`, demonstrating how UCON (Park & Sandhu, 2004) enforces access control beyond what RBAC can achieve:

| Feature | RBAC | UCON (this app) |
|---|---|---|
| Check rental expiry mid-session | No | Yes — onA0 revokes via SSE |
| Limit rental to 3 views | No | Yes — preA1 decrements atomically |
| Enforce 15s ad before play | No | Yes — preB0 blocks until ads_history.completed=true |
| Restrict by geographic region | No | Yes — preC0 checks user_locations |
| Block account sharing (>3 devices) | No | Yes — preA1 atomic counter |
| Audit trail (non-deletable) | No | Yes — preA0 denial for delete right |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js Frontend (port 3000)                               │
│  App Router + Tailwind CSS                                  │
│  navigator.geolocation → POST /api/users/location (preC0)   │
│  EventSource SSE ← REVOKED / HEARTBEAT events (onA0)        │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP / SSE
┌─────────────────────────▼───────────────────────────────────┐
│  Go Backend — Gin (port 8080)                               │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │   PEP    │  │   PDP    │  │   PIP    │  │   PAP     │  │
│  │ (Router/ │→ │ (ucon/   │→ │(PostgreSQL│  │(Admin     │  │
│  │Middleware)│  │engine.go)│  │ Pool)    │  │ handlers) │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
│                                                             │
│  static/videos/  — movie .mp4 files (Range-served)         │
│  static/ads/     — ad .mp4 files                           │
└─────────────────────────┬───────────────────────────────────┘
                          │ pgx/v5 pool
┌─────────────────────────▼───────────────────────────────────┐
│  PostgreSQL 16 (port 5432)                                  │
│  12 tables (see schema below)                               │
└─────────────────────────────────────────────────────────────┘
```

**UCON Components mapping:**

| UCON Component | Implementation |
|---|---|
| PEP (Policy Enforcement Point) | Gin middleware + route handlers |
| PDP (Policy Decision Point) | `internal/ucon/engine.go` functions |
| PIP (Policy Information Point) | PostgreSQL (rentals, subscriptions, user_locations) |
| PAP (Policy Administration Point) | `/api/admin/*` endpoints |

---

## Database Schema

### 12 Tables

#### users
| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK | |
| username | varchar unique | |
| password_hash | text | bcrypt cost=10 |
| full_name | varchar | |
| gender | enum | unknown/male/female |
| role | enum | user/admin |
| account_type | enum nullable | basic/premium — NULL when role=admin |
| offline_count | int | tracks active offline downloads (max 5) |
| copyright_consented_at | timestamptz nullable | preB1 first-time consent |
| status | enum | active/blocked/deleted |
| created_at, updated_at | timestamptz | |

#### movies
| Column | Type | Notes |
|---|---|---|
| movie_id | uuid PK | |
| title, genre | varchar | |
| duration_minutes | int | |
| geo_restriction | text[] | ISO 3166-1 alpha-2 codes; empty = unrestricted |
| is_available | bool | soft-delete via admin |
| video_file | text | filename in `backend/static/videos/` |
| created_at, updated_at | timestamptz | |

#### rentals (Object — mutable)
| Column | Type | Notes |
|---|---|---|
| rental_id | uuid PK | |
| user_id | uuid FK | |
| movie_id | uuid FK | |
| rental_views_remaining | int | starts at 3, decremented by preA1 |
| rental_expiry | timestamptz | now() + 72 hours |
| created_at | timestamptz | |

#### subscriptions (Object — mutable)
| Column | Type | Notes |
|---|---|---|
| subscription_id | uuid PK | |
| user_id | uuid FK unique | |
| subscription_expiry | timestamptz | |
| active_device_count | int | incremented preA1, decremented onA3 |
| created_at, updated_at | timestamptz | |

#### sessions
| Column | Type | Notes |
|---|---|---|
| session_id | uuid PK | |
| user_id, movie_id | uuid FK | |
| session_type | enum | rental/subscription |
| rental_id | uuid nullable FK | |
| device_info | text | User-Agent string |
| started_at | timestamptz | |
| ended_at | timestamptz nullable | |
| is_active | bool | set to false on stop/revoke |
| created_at, updated_at | timestamptz | |

#### watch_history (append-only audit trail)
No DELETE endpoint exposed. preA0 denial enforced at API layer.

#### offline_downloads
| status | Trigger |
|---|---|
| active | after successful download (preA1) |
| deleted | user soft-deletes (onA3 — decrements offline_count) |
| revoked | subscription expires (onA0 — decrements offline_count) |

#### audit_log (append-only)
Every admin action (CREATE/UPDATE/DELETE movie, BLOCK user) writes a record here (onA3).

#### user_locations
Populated by FE `navigator.geolocation` → `POST /api/users/location`.  
Backend calls OpenStreetMap Nominatim to resolve `country_code`.  
preC0 reads the latest record per user.

#### payment_transactions
Records every payment event (rental: ₫45,000, subscription: ₫99,000/month).  
Always `status=success` in mock mode. preB1 validates transaction exists before granting access.

#### ads + ads_history
`ads`: metadata for ad videos in `backend/static/ads/`.  
`ads_history`: tracks per-rental-attempt ad completion (`completed=true` when `watch_duration_seconds >= 15`).  
preB0 checks `ads_history` before allowing `POST /api/rentals/:id/play`.

---

## UCON Policy Engine

File: `backend/internal/ucon/engine.go`

### Authorization (A) — pre, immutable (preA0)
```
PreA0_RentalExists      — rental != nil
PreA0_RentalExpiry      — rental.rental_expiry > now()
PreA0_SubscriptionExpiry — subscription.subscription_expiry > now()
PreA0_AccountType       — user.account_type == required
PreA0_RoleCheck         — user.role == required
PreA0_OwnershipCheck    — subject.user_id == object.user_id
PreA0_MovieAvailable    — movie.is_available == true
```

### Condition (C) — pre, environment (preC0)
```
PreC0_GeoRestriction    — user_locations.country_code ∈ movie.geo_restriction
                          (empty geo_restriction = unrestricted)
FetchCountryCode        — Nominatim reverse geocoding (lat/lng → ISO country code)
GetUserCountryCode      — latest country_code from user_locations
```

### Authorization (A) — pre, mutable (preA1)
```
PreA1_DecrementViews          — atomic UPDATE rental WHERE views > 0
PreA1_IncrementDeviceCount    — atomic UPDATE subscription WHERE count < 3
PreA1_IncrementOfflineCount   — atomic UPDATE users WHERE offline_count < 5
PreA1_CreateRental            — INSERT rental (views=3, expiry=+72h)
PreA1_UpdateSubscriptionExpiry — UPSERT subscription expiry
```

### Obligation (B) — pre
```
PreB0_AdObligation      — check ads_history.completed=true within 5 min for rental
PreB1_CopyrightConsent  — check/record copyright_consented_at on first rent
PreB1_MockPayment       — INSERT payment_transactions (always success)
PreB1_TwoFactorAuth     — accept any non-empty X-2FA-Code header
```

### Authorization (A) — on, post-update (onA3)
```
OnA3_WriteWatchHistory    — INSERT watch_history from session data
OnA3_DecrementDeviceCount — UPDATE subscription.active_device_count - 1
OnA3_DecrementOfflineCount — UPDATE users.offline_count - 1
OnA3_WriteAuditLog        — INSERT audit_log
```

### Continuity of Decisions (onA0) — SSE
`GET /api/sessions/:id/events` opens a Server-Sent Events connection.  
A goroutine checks `rental_expiry` or `subscription_expiry` every 15 seconds.  
On expiry: sends `event: REVOKED` → closes session → writes watch_history (onA3).

---

## API Endpoints

### Public
| Method | Path | Description |
|---|---|---|
| POST | /api/auth/register | Create account (basic or premium) |
| POST | /api/auth/login | Login, returns JWT |

### Protected (Authorization: Bearer \<token\>)

#### User / Profile
| Method | Path | UCON | Actor |
|---|---|---|---|
| GET | /api/auth/me | — | all |
| POST | /api/users/location | preC0 setup | all |

#### Movies
| Method | Path | UCON | Actor |
|---|---|---|---|
| GET | /api/movies | browse | all |
| GET | /api/movies/:id | browse | all |

#### Rentals
| Method | Path | UCON | Actor |
|---|---|---|---|
| POST | /api/rentals | preA0, preB1, preA1 | basic_user |
| GET | /api/rentals | — | basic_user |
| POST | /api/rentals/:id/play | preA0, preC0, preB0, preA1 | basic_user |

#### Ads
| Method | Path | UCON | Actor |
|---|---|---|---|
| POST | /api/ads/complete | preB0 completion | basic_user |
| GET | /api/ads/:id/stream | serve ad video | basic_user |

#### Sessions
| Method | Path | UCON | Actor |
|---|---|---|---|
| POST | /api/sessions/:id/stop | onA3 | all |
| GET | /api/sessions/:id/events | SSE onA0 | all |
| GET | /api/stream/:session_id | video Range serve | all |

#### Subscriptions
| Method | Path | UCON | Actor |
|---|---|---|---|
| POST | /api/subscriptions | preA0, preB1, preA1 | all |
| GET | /api/subscriptions/me | — | premium_user |
| POST | /api/subscriptions/play/:movie_id | preA0, preC0, preA1 | premium_user |

#### Offline Downloads
| Method | Path | UCON | Actor |
|---|---|---|---|
| GET | /api/offline | — | premium_user |
| POST | /api/offline/download/:movie_id | preA0, preC0, preA1, preB1 | premium_user |
| DELETE | /api/offline/:download_id | onA3 | premium_user |

#### Watch History
| Method | Path | UCON | Actor |
|---|---|---|---|
| GET | /api/history | preA0 (ownership) | all |

#### Admin (preA0 role=admin + preB1 X-2FA-Code)
| Method | Path | UCON | Notes |
|---|---|---|---|
| GET | /api/admin/movies | preA0, preB1 | |
| POST | /api/admin/movies | preA0, preB1, onA3 | creates audit_log |
| PUT | /api/admin/movies/:id | preA0, preB1, onA3 | creates audit_log |
| DELETE | /api/admin/movies/:id?reason=... | preA0, preB1, onA3 | soft-delete |
| GET | /api/admin/audit-log | preA0 | |
| GET | /api/admin/users | preA0 | |
| PUT | /api/admin/users/:id/block?reason=... | preA0, preB1, onA3 | |

---

## Demo Flows

### Flow 1: basic_user rents and plays a movie (preA0 + preB0 + preA1 + onA0 + onA3)

1. Login as `basic_demo / Password123!`
2. Browse movies → click a movie
3. Click **Rent** → preA0 (account_type=basic, movie available) + preB1 (consent recorded, mock payment)
4. Click **Play** → preA0 (rental exists, expiry valid) + preC0 (geo check) + preB0 (must watch ad)
5. Ad player: watch 15 seconds → **Start Movie** button activates
6. Movie plays with SSE connection open
7. Click **Stop** → onA3 (write watch_history)
8. Check `/history` → record appears, no delete button (preA0 denial)

### Flow 2: preA0 blocks 4th view
1. As `basic_demo`, rent a movie
2. Play it 3 times (each time: watch ad → play → stop)
3. 4th attempt → `rental_views_remaining = 0` → **403 preA0**

### Flow 3: onA0 revokes mid-session
1. In DB, manually set `rental_expiry = NOW() - 1 minute` for an active rental
2. SSE goroutine detects expiry within 15s → sends `REVOKED` event → FE shows revocation screen

### Flow 4: premium_user account sharing blocked (preA1)
1. Login as `premium_demo` on 3 browser tabs → start 3 streaming sessions
2. 4th tab → **403 preA1** ("maximum device limit reached")

### Flow 5: geo-restriction (preC0)
1. Movie "Elephant Dream" has `geo_restriction: ["VN","US","GB"]`
2. User from another country → preC0 blocks play
3. Update `user_locations` to "VN" → play succeeds

### Flow 6: admin manages catalog (preA0 + preB1 + onA3)
1. Login as `admin_demo / Password123!`
2. Go to Admin → X-2FA-Code: `MOCK_2FA_123456` is sent automatically
3. Add a movie → audit_log entry created (onA3)
4. Check Audit tab → record visible

---

## Quick Start

### Prerequisites
- Docker 24+
- Docker Compose v2

### 1. Clone and configure

```bash
git clone <repo-url>
cd hcmus-master-is-security-seminar01-ucon

cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 2. Add video files (required for streaming)

Place `.mp4` files in `backend/static/videos/` matching the seed data filenames:

```
backend/static/videos/
  big_buck_bunny.mp4        # https://download.blender.org/peach/bigbuckbunny_movies/
  elephant_dream.mp4        # https://orange.blender.org/download/
  tears_of_steel.mp4        # https://mango.blender.org/download/
  cosmos_laundromat.mp4
  sintel.mp4                # https://durian.blender.org/download/
```

Place an ad video (minimum 15 seconds) in:

```
backend/static/ads/
  ucon_demo_ad.mp4          # Any 15+ second video for the ad obligation demo
```

> All Blender Foundation films above are Creative Commons licensed and free to use.

### 3. Install frontend libraries

```bash
cd frontend && npm install
cd ..
```

This generates `package-lock.json`, which is required by `npm ci` inside the Docker build.

### 4. Start all services

```bash
docker compose up --build
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8080
- PostgreSQL: localhost:5432

### 5. Verify

```bash
# Check backend health
curl http://localhost:8080/api/movies

# Check database
docker exec ucon_postgres psql -U ucon -d ucon_db -c "SELECT username, role, account_type FROM users;"
```

### 6. Development (without Docker)

**Backend:**
```bash
cd backend
cp ../.env.example .env  # or set env vars manually
go mod tidy
go run ./cmd/server
```

**Frontend:**
```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://localhost:8080 npm run dev
```

**Database:**
```bash
# Start PostgreSQL locally and run:
psql -U ucon -d ucon_db -f db/001_init.sql
```

---

## Project Structure

```
hcmus-master-is-security-seminar01-ucon/
├── backend/
│   ├── cmd/server/main.go          — entry point, Gin router setup
│   ├── internal/
│   │   ├── auth/
│   │   │   ├── jwt.go              — JWT generation/validation (HS256)
│   │   │   └── password.go        — bcrypt helpers (cost=10)
│   │   ├── database/db.go         — pgxpool connection
│   │   ├── handlers/
│   │   │   ├── auth.go            — register, login, me
│   │   │   ├── movies.go          — list, get
│   │   │   ├── rentals.go         — rent, list, play (preA0/preC0/preB0/preA1)
│   │   │   ├── subscriptions.go   — subscribe, get, play (preA0/preC0/preA1)
│   │   │   ├── sessions.go        — stop, SSE (onA0), stream video
│   │   │   ├── offline.go         — list, download, delete (preA0/preC0/preA1/onA3)
│   │   │   ├── history.go         — list (preA0, no delete)
│   │   │   ├── ads.go             — complete (preB0)
│   │   │   ├── geo.go             — save location (preC0 setup)
│   │   │   └── admin.go           — CRUD movies, audit log, users (preA0/preB1/onA3)
│   │   ├── middleware/auth.go      — JWT middleware, role/account_type guards
│   │   ├── models/models.go       — Go structs for all DB tables
│   │   └── ucon/engine.go         — UCON Policy Engine (all preA/preB/preC/onA functions)
│   ├── static/
│   │   ├── videos/                — movie .mp4 files
│   │   └── ads/                   — ad .mp4 files
│   ├── Dockerfile
│   └── go.mod
│
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx               — home / browse
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── movies/[id]/page.tsx   — movie detail, rent/play/download
│   │   ├── watch/
│   │   │   ├── ad/[rentalId]/page.tsx  — Ad player (preB0, 15s timer)
│   │   │   └── [sessionId]/page.tsx   — Movie player (SSE onA0)
│   │   ├── history/page.tsx       — watch history (no delete)
│   │   ├── offline/page.tsx       — offline downloads (premium)
│   │   ├── subscription/page.tsx  — subscribe / renew
│   │   └── admin/page.tsx         — admin console
│   ├── components/
│   │   ├── Navbar.tsx
│   │   └── MovieCard.tsx
│   ├── lib/
│   │   ├── api.ts                 — API client + TypeScript types
│   │   ├── auth.ts                — login/register/logout helpers
│   │   └── geo.ts                 — navigator.geolocation helper
│   └── Dockerfile
│
├── db/
│   └── 001_init.sql               — schema + seed data
│
├── docker-compose.yml
├── .env.example
└── README.md                      — this file (source of truth)
```

---

## Demo Credentials

| Username | Password | Role | Account Type |
|---|---|---|---|
| basic_demo | Password123! | user | basic |
| premium_demo | Password123! | user | premium |
| admin_demo | Password123! | admin | — |

Admin 2FA: `MOCK_2FA_123456` (sent automatically by frontend via `X-2FA-Code` header)

---

## Known Limitations (academic demo)

| Feature | Status | Notes |
|---|---|---|
| Payment | Mock | Always succeeds; transaction recorded for UCON audit |
| 2FA | Mock | Any non-empty `X-2FA-Code` accepted; value `MOCK_2FA_123456` used |
| Geo-restriction | Real | Uses `navigator.geolocation` + OpenStreetMap Nominatim |
| Ad obligation | Real | 15-second timer enforced client-side + server validates duration |
| Video streaming | Real | HTTP Range requests served from `backend/static/videos/` |
| Watermarking | Not implemented | Noted as limitation in CONTENT_V2.md |
| Subscription auto-revoke offline | Partial | onA0 revoke triggered on file open (client must check expiry) |

---

## References

- Park, J., & Sandhu, R. (2004). The UCON_ABC usage control model. ACM Transactions on Information and System Security.
- NIST SP 800-207: Zero Trust Architecture
- OpenStreetMap Nominatim API: https://nominatim.org/
