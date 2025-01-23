# Turso CDN

This guide will help you self host a multi-region write-through cache proxy for serverless SQLite with [Turso](https://turso.tech).

Turso CDN provides similar guarantees to Turso's (deprecated) Edge Replicas.

## How It Works

1. **Regional Routing**: Fly.io automatically routes requests to the nearest proxy instance using anycast IPs.
2. **Local Replicas**: Each region maintains a local SQLite file that syncs with the primary database.
3. **Sync Interval**: The local replicas sync every 60 seconds (configurable) with the primary database.

```plaintext
Client (Asia)     Client (US)    Client (EU)
     |               |              |
     v               v              v
[Fly Anycast IP - Global Load Balancing]
     |               |              |
     v               v              v
[sin proxy]     [bos proxy]    [lhr proxy]     # Each has local SQLite replica
     |               |              |
     \               |              /
      \              |             /
       \             |            /
        \            v           /
         `----> [Turso/LibSQL] <´          # Primary database
                Sync every 60s
```

## Prerequisites

- Fly.io account and [`flyctl`](https://fly.io/docs/flyctl/install/) installed
- [Turso](https://turso.tech) cloud account and database created

## Quickstart

1. Clone the repository

```bash
git clone https://github.com/notrab/turso-cdn
cd turso-cdn
```

2. Create a Fly app:

```bash
fly launch
```

When prompted:

- Choose a unique app name
- Select "No" for Postgres/Redis
- Select "No" for immediate deployment

3. Create volumes in your desired regions:

```bash
fly volumes create libsql_data --size 10 --region lhr
fly volumes create libsql_data --size 10 --region sin
fly volumes create libsql_data --size 10 --region bos
```

4. Set your Turso database credentials:

```bash
fly secrets set TURSO_DATABASE_URL=libsql://your-database.turso.io
fly secrets set TURSO_AUTH_TOKEN=your-auth-token
fly secrets set PROXY_AUTH_TOKEN=a-random-string

# Optional: Set the sync interval (default is 60 seconds)
# fly secrets set TURSO_SYNC_INTERVAL=30
```

5. Deploy to multiple regions:

```bash
fly deploy
fly scale count 3 --region lhr,sin,bos
```

6. Check that each region is running:

```bash
fly status
```

## Using the CDN

Update your client applications to use the proxy:

> [!NOTE]
> Make sure to use `https://` for the proxy URL and not `libsql://`.

> [!NOTE]
> The `authToken` here is the `PROXY_AUTH_TOKEN` you set in the Fly secrets, this is created by you and not Turso.

```ts
import { createClient } from "@libsql/client/web";

const client = createClient({
  url: "https://your-cdn.fly.dev",
  authToken: process.env.PROXY_AUTH_TOKEN,
});

// The client will automatically connect to the nearest region
const result = await client.execute("SELECT 1");
```

### Adding Edge Replicas

To expand to new regions:

1. Create a volume in the new region:

```bash
fly volumes create libsql_data --size 10 --region new-region
```

2. Scale the application:

```bash
fly scale count 4 --region lhr,sin,bos,new-region
```

### Removing Edge Replicas

1. Scale down the regions:

```bash
# Scale down to just one instance in the primary region
fly scale count 1

# Or keep multiple regions but reduce count
fly scale count 1 --region lhr,sin

# Remove a specific region entirely while keeping others
fly scale count 0 --region sin
```

2. Remove the volumes not longer used:

```bash
# List volumes first to see what exists
fly volumes list

# Remove volume in a specific region
fly volumes destroy libsql_data --region sin
```

## Monitoring, Troubleshooting and Configuration

SOme of the commands and steps below help you customise the proxy to your individual needs.

### Check Replica Status

View the logs from a specific region:

```bash
fly logs --region sin
```

### Verify Local Database

SSH into an instance to check the local database:

```bash
fly ssh console
ls -l /app/data/local.db
```

### Performance Testing

Test latency from different regions by passing the `fly-prefer-region` header:

```bash
curl -s -X POST https://your-cdn.fly.dev/v2/pipeline \
  -w "\nTotal time: %{time_total}s\n" \
  -H "fly-prefer-region: sin" \
  -H "Authorization: Bearer your-proxy-auth-secret" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT 1","want_rows":true}},{"type":"close"}]}'
```

### Custom Sync Interval

You can change the sync interval by setting the `TURSO_SYNC_INTERVAL` secret:

```bash
fly secrets set TURSO_SYNC_INTERVAL=30 # 30 seconds
```

If not set, the value defaults to `60` seconds.
