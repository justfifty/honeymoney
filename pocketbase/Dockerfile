# Reproducible PocketBase for hosting the HoneyMoney database (Fly.io / Railway /
# Render / any container host). Pins the same version the repo uses locally and
# bakes in the committed migrations, so a fresh deploy auto-creates the schema +
# seeds the three demo personas on first boot.
FROM alpine:3.20

ARG PB_VERSION=0.39.6
RUN apk add --no-cache ca-certificates unzip wget

RUN wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb \
    && rm /tmp/pb.zip

# committed migrations (schema + demo seed) travel with the image
COPY pb_migrations /pb/pb_migrations

EXPOSE 8090

# On boot: create/refresh the superuser from env, then serve (migrations apply).
# Data persists in /pb/pb_data — mount a volume there so redeploys keep data.
CMD ["/bin/sh", "-c", "/pb/pocketbase superuser upsert \"$POCKETBASE_ADMIN_EMAIL\" \"$POCKETBASE_ADMIN_PASSWORD\" 2>/dev/null; exec /pb/pocketbase serve --http=0.0.0.0:8090 --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations"]
