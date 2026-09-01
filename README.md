# Forklift

Review 300 forks before lunch.

A review engine for the [Solari intern challenge](https://github.com/solari-sdk/solari-cookbook). Paste an upstream repo and judging criteria. Forklift discovers every public fork, runs selected submissions in isolated Solari sandboxes, records a browser walking the live preview, and returns an evidence card. It does not rank candidates and it does not recommend a hire.

## Run locally

```bash
cp .env.example .env.local
# fill SOLARI_API_KEY from console.getsolari.com
# GITHUB_TOKEN recommended once you pass ~60 GitHub calls/hour
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). **Run contest review** discovers the cookbook fork network, fills five bays in parallel, and pins this Forklift tree as bay 05.

Without `SOLARI_API_KEY` the floor still runs in fixture mode so you can ship the UI. Live sandbox + recording needs the key.

## Verify a submission

`/verify` or the dock form. One public GitHub URL in, one evidence card out. Export is `/api/bays/:id/export`.

## Railway

One service. Add a Postgres plugin and set:

- `DATABASE_URL` (from the plugin)
- `SOLARI_API_KEY`
- `GITHUB_TOKEN`
- `FORKLIFT_ACCESS_KEY` (required in production or anyone can spend your Solari credits)

`npm run start` binds `0.0.0.0:$PORT`. Healthcheck is `GET /api/health`. Do not scale replicas; the five-bay pool is in-process.

## `forklift.yaml`

If automatic startup detection fails, a repo-root `forklift.yaml` wins. This repo ships one so Forklift can review itself.
