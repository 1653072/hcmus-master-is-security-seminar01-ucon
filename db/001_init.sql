-- =============================================================================
-- UCON Movie Platform — Database Schema
-- PostgreSQL 15+
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE user_role         AS ENUM ('user', 'admin');
CREATE TYPE user_gender       AS ENUM ('unknown', 'male', 'female');
CREATE TYPE user_account_type AS ENUM ('basic', 'premium');
CREATE TYPE user_status       AS ENUM ('active', 'blocked', 'deleted');
CREATE TYPE session_type      AS ENUM ('rental', 'subscription');
CREATE TYPE offline_status    AS ENUM ('active', 'deleted', 'revoked');
CREATE TYPE payment_tx_type   AS ENUM ('rental', 'subscription');
CREATE TYPE payment_tx_status AS ENUM ('success', 'failed');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Subject: user
-- role=admin => account_type IS NULL (enforced by application layer)
-- status: active | blocked (by system) | deleted (soft-delete by user)
CREATE TABLE users (
    user_id                 UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    username                VARCHAR(50)     UNIQUE NOT NULL,
    password_hash           TEXT            NOT NULL,
    full_name               VARCHAR(100)    NOT NULL,
    gender                  user_gender     NOT NULL DEFAULT 'unknown',
    role                    user_role       NOT NULL DEFAULT 'user',
    account_type            user_account_type NULL,           -- NULL when role='admin'
    offline_count           INT             NOT NULL DEFAULT 0 CHECK (offline_count >= 0),
    copyright_consented_at  TIMESTAMPTZ     NULL,
    offline_consent_at      TIMESTAMPTZ     NULL,           -- preB1: no-share commitment before first offline download
    status                  user_status     NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Object: movie (master data, immutable business attributes)
-- geo_restriction: ISO 3166-1 alpha-2 codes; empty array = unrestricted
CREATE TABLE movies (
    movie_id        UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL,
    genre           VARCHAR(100) NOT NULL,
    duration_minutes INT         NOT NULL CHECK (duration_minutes > 0),
    geo_restriction TEXT[]      NOT NULL DEFAULT '{}',
    is_available    BOOL        NOT NULL DEFAULT TRUE,
    video_file      TEXT        NOT NULL,   -- filename in backend/static/videos/
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Object: rental (mutable — rental_views_remaining, rental_expiry)
-- Linked to (basic_user, movie). Created on rent action.
CREATE TABLE rentals (
    rental_id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID        NOT NULL REFERENCES users(user_id),
    movie_id                UUID        NOT NULL REFERENCES movies(movie_id),
    rental_views_remaining  INT         NOT NULL DEFAULT 3 CHECK (rental_views_remaining >= 0),
    rental_expiry           TIMESTAMPTZ NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Object: subscription (mutable — subscription_expiry, active_device_count)
-- One per premium_user. Created on first subscribe action.
CREATE TABLE subscriptions (
    subscription_id     UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID        NOT NULL UNIQUE REFERENCES users(user_id),
    subscription_expiry TIMESTAMPTZ NOT NULL,
    active_device_count INT         NOT NULL DEFAULT 0 CHECK (active_device_count >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active playback session (tracks onA0 monitoring)
CREATE TABLE sessions (
    session_id   UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID         NOT NULL REFERENCES users(user_id),
    movie_id     UUID         NOT NULL REFERENCES movies(movie_id),
    session_type session_type NOT NULL,
    rental_id    UUID         NULL REFERENCES rentals(rental_id),
    device_info  TEXT         NOT NULL DEFAULT '',
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ended_at     TIMESTAMPTZ  NULL,
    is_active    BOOL         NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Object: watch_history (audit trail — no DELETE permission via API)
CREATE TABLE watch_history (
    history_id  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(user_id),
    movie_id    UUID        NOT NULL REFERENCES movies(movie_id),
    watch_start TIMESTAMPTZ NOT NULL,
    watch_end   TIMESTAMPTZ NOT NULL,
    device_info TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Object: offline_downloads
-- status: active | deleted (by user, onA3) | revoked (subscription expired, onA0)
CREATE TABLE offline_downloads (
    download_id  UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID           NOT NULL REFERENCES users(user_id),
    movie_id     UUID           NOT NULL REFERENCES movies(movie_id),
    downloaded_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    status       offline_status NOT NULL DEFAULT 'active',
    created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- Audit trail for admin actions (append-only)
CREATE TABLE audit_log (
    log_id      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id    UUID        NOT NULL REFERENCES users(user_id),
    action      TEXT        NOT NULL,
    target_type TEXT        NOT NULL,
    target_id   TEXT        NOT NULL,
    reason      TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User geo location (for preC0 geo-restriction validation)
-- Populated by FE navigator.geolocation + backend Nominatim reverse geocoding
CREATE TABLE user_locations (
    location_id  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID        NOT NULL REFERENCES users(user_id),
    country_code CHAR(2)     NOT NULL,
    latitude     FLOAT8      NOT NULL,
    longitude    FLOAT8      NOT NULL,
    captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payment transactions (for preB1 obligation validation)
-- Always status=success in mock mode, but record exists for UCON validation
CREATE TABLE payment_transactions (
    transaction_id   UUID              PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID              NOT NULL REFERENCES users(user_id),
    transaction_type payment_tx_type   NOT NULL,
    target_id        UUID              NOT NULL,  -- rental_id or subscription_id
    amount_vnd       INT               NOT NULL DEFAULT 0,
    status           payment_tx_status NOT NULL DEFAULT 'success',
    created_at       TIMESTAMPTZ       NOT NULL DEFAULT NOW()
);

-- Ads master data (preB0 obligation)
CREATE TABLE ads (
    ad_id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    title            TEXT        NOT NULL,
    video_file       TEXT        NOT NULL,  -- filename in backend/static/ads/
    duration_seconds INT         NOT NULL CHECK (duration_seconds > 0),
    is_active        BOOL        NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ad viewing history (tracks preB0 completion per rental attempt)
-- completed=true when watch_duration_seconds >= 15
CREATE TABLE ads_history (
    history_id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID        NOT NULL REFERENCES users(user_id),
    rental_id            UUID        NOT NULL REFERENCES rentals(rental_id),
    movie_id             UUID        NOT NULL REFERENCES movies(movie_id),
    ad_id                UUID        NOT NULL REFERENCES ads(ad_id),
    watch_start          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    watch_end            TIMESTAMPTZ NULL,
    watch_duration_seconds INT       NOT NULL DEFAULT 0,
    completed            BOOL        NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_rentals_user_id              ON rentals(user_id);
CREATE INDEX idx_rentals_movie_id             ON rentals(movie_id);
CREATE INDEX idx_rentals_expiry               ON rentals(rental_expiry);
CREATE INDEX idx_sessions_user_id             ON sessions(user_id);
CREATE INDEX idx_sessions_is_active           ON sessions(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_watch_history_user_id        ON watch_history(user_id);
CREATE INDEX idx_offline_downloads_user_id    ON offline_downloads(user_id);
CREATE INDEX idx_offline_downloads_status     ON offline_downloads(status);
CREATE INDEX idx_user_locations_user_id       ON user_locations(user_id);
CREATE INDEX idx_user_locations_captured_at   ON user_locations(captured_at DESC);
CREATE INDEX idx_audit_log_admin_id           ON audit_log(admin_id);
CREATE INDEX idx_ads_history_rental_id        ON ads_history(rental_id);
CREATE INDEX idx_ads_history_completed        ON ads_history(rental_id, completed, created_at DESC);
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_movies_created_at            ON movies(created_at DESC);

-- =============================================================================
-- SEED DATA
-- =============================================================================
-- Demo passwords: all users use "Password123!"
-- BCrypt hash below is for "Password123!" with cost=10

DO $$
DECLARE
    hash TEXT := '$2a$10$UD/dWW5NHMnj8h0Y4le2Ke2hAIBggUGEoWaAvaTU0ciErTakVxKqu';
BEGIN

-- Users
INSERT INTO users (user_id, username, password_hash, full_name, gender, role, account_type, status)
VALUES
    ('00000000-0000-0000-0000-000000000001',
     'basic_demo', hash, 'Basic Demo User', 'male', 'user', 'basic', 'active'),
    ('00000000-0000-0000-0000-000000000002',
     'premium_demo', hash, 'Premium Demo User', 'female', 'user', 'premium', 'active'),
    ('00000000-0000-0000-0000-000000000003',
     'admin_demo', hash, 'Admin Demo User', 'unknown', 'admin', NULL, 'active');

-- Subscription for premium_demo (30 days from now)
INSERT INTO subscriptions (user_id, subscription_expiry)
VALUES ('00000000-0000-0000-0000-000000000002', NOW() + INTERVAL '30 days');

-- Movies (using open-source Blender Foundation films as placeholders)
INSERT INTO movies (movie_id, title, genre, duration_minutes, geo_restriction, is_available, video_file)
VALUES
    ('00000000-0000-0000-0000-000000000101',
     'Big Buck Bunny', 'Animation', 10, '{}', TRUE, 'big_buck_bunny.mp4'),
    ('00000000-0000-0000-0000-000000000102',
     'Elephant Dream', 'Animation', 11, '{"VN","US","GB"}', TRUE, 'elephant_dream.mp4'),
    ('00000000-0000-0000-0000-000000000103',
     'Tears of Steel', 'Sci-Fi', 12, '{"VN","US","JP"}', TRUE, 'tears_of_steel.mp4'),
    ('00000000-0000-0000-0000-000000000104',
     'Cosmos Laundromat', 'Fantasy', 12, '{}', TRUE, 'cosmos_laundromat.mp4'),
    ('00000000-0000-0000-0000-000000000105',
     'Sintel', 'Fantasy', 15, '{"VN","JP","KR","GB"}', TRUE, 'sintel.mp4');

-- Ad (15-second demo ad)
INSERT INTO ads (ad_id, title, video_file, duration_seconds, is_active)
VALUES
    ('00000000-0000-0000-0000-000000000201',
     'UCON Platform — Security Demo', 'ucon_demo_ad.mp4', 15, TRUE);

END $$;
