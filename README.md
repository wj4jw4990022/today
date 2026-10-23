# 致日子官網（Cloudflare Worker + D1）

- `src/` Worker（API 在 `/api`，圖片在 `/img/<id>`，其餘為靜態網站 `public/`）
- `migrations/` D1 資料表（`wrangler d1 migrations apply zhirizi-db --remote`）
- `apps-script/MailRelay.gs` 寄信中繼（過渡方案）
- `test/` 本機測試：`npm i && node test/api.test.mjs`

## 部署（GitHub 自動部署）
1. Cloudflare → Workers & Pages → `aged-surf-919d` → Settings → Builds → 連接此 GitHub repo，Deploy command：`npx wrangler deploy`
2. Settings → Variables and Secrets 新增（Secret）：`LINE_TOKEN`、`LINE_TO`、`MAIL_RELAY_URL`、`MAIL_RELAY_KEY`、`CONTACT_EMAIL`（皆可先空）
3. 之後 `git push` 即自動部署；新增資料表時另執行 migrations。
