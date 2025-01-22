# libsql-proxy

This guide will help you set up a multi-region proxy for libSQL/Turso with local replicas in each region. The proxy uses local SQLite files that sync with your primary database, providing lower latency for reads in each region.

## How It Works

1. **Regional Routing**: Fly.io automatically routes requests to the nearest proxy instance using anycast IPs.
2. **Local Replicas**: Each region maintains a local SQLite file that syncs with the primary database.
3. **Sync Interval**: The local replicas sync every 60 (configurable) seconds with the primary database.

## Prerequisites

- Fly.io account and `flyctl` installed
- Turso account and database created

## Quickstart

1. Clone the repository

```bash
git clone https://github.com/notrab/libsql-proxy
cd libsql-proxy
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
fly volumes create libsql_data --size 10 --region sfo
```

4. Set your Turso database credentials:

```bash
fly secrets set PRIMARY_URL=libsql://your-database.turso.io
fly secrets set AUTH_TOKEN=your-auth-token
```

5. Deploy to multiple regions:

```bash
fly deploy
fly scale count 3 --region lhr,sin,sfo
```

6. Check that each region is running:

```bash
fly status
```

## Using the Proxy

Update your client applications to use the proxy:

```ts
import { createClient } from "@libsql/client/web";

const client = createClient({
  url: "https://your-proxy-app.fly.dev",
  authToken: "your-client-token",
});

// The client will automatically connect to the nearest region
const result = await client.execute("SELECT 1");
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

Test latency from different regions:

```bash
fly ping your-proxy-app.fly.dev
```

### Custom Sync Interval

Modify the sync interval in `server.js`:

```ts
const localClient = createClient({
  url: "file:/app/data/local.db",
  syncUrl: process.env.PRIMARY_URL,
  authToken: process.env.AUTH_TOKEN,
  syncInterval: 60, // Adjust this value (in seconds)
});
```

### Adding More Regions

To expand to new regions:

1. Create a volume in the new region:

```bash
fly volumes create libsql_data --size 10 --region new-region
```

2. Scale the application:

```bash
fly scale count 4 --region lhr,sin,sfo,new-region
```
