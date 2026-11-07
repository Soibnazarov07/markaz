# Railway staging and release — EduSphere Pro 8.2

**Existing project:** `markaziy`, source repository `markaz`. Preserve existing service and persistent Volume. **Do not delete or replace the live database.**

## 1. Isolated local tests

Use Node 22 LTS on a computer with working npm network access:

```bash
npm ci
npm run test:static
npm run test:schema
npm run test:integration
```

The `test:integration` suite creates and removes its own temporary SQLite directories. It also checks two-socket signaling, role permissions, 160 GET load requests and payment persistence across process restarts. **NEVER set `DATA_DIR` to live Railway `/data` for this suite**, and run it on your own computer or a separate disposable test container, not inside the running production server. Do not upload `node_modules`, `.env`, `data`, or real user backups to GitHub.

## 2. Railway staging

Create a staging environment or a separate disposable service backed by its own Volume. Set `DATA_DIR` to the volume mount path, e.g. `/data`; set `NODE_ENV=production`, valid `ADMIN_EMAIL`, 12+ char `ADMIN_PASSWORD` and stable 32+ char `JWT_SECRET`. **Never put real secret values in screenshots or chat.**

Keep the existing service unchanged until staging tests pass. The site already has `GET /api/health` which returns 200 only if SQLite is available. Set the Railway service **Healthcheck path** to `/api/health` in Settings → Deploy (new Railway projects prefer Infrastructure as Code to legacy railway.json).

On your own development machine (read-only requests):

```bash
BASE_URL=https://YOUR-STAGING-DOMAIN npm run smoke:http
```

The smoke test calls only GET endpoints unless `ADMIN_EMAIL` and `ADMIN_PASSWORD` are supplied; even with those variables it logs in, then calls only GET endpoints. Do not use production administrator secrets unnecessarily.

Check Railway → Deployments → View Logs and Railway → Observability → Logs. Log access can also be obtained using `railway logs --lines 100` after linking the correct service.

## 3. Two-device video validation (real media)

From two separate browsers/devices (one teacher, one enrolled student) on **HTTPS**:
1. Teacher schedules and starts a live lesson.
2. Both users join the exact same course lesson using their own accounts.
3. Each confirms remote video and remote microphone audio (test with headphones to avoid echo).
4. Test turning camera/microphone off/on and screen sharing, then reconnect with one device on mobile data rather than the same Wi-Fi.
5. If cross-network calls fail, configure your own trusted TURN server in Railway environment (`TURN_URL`, `TURN_USERNAME`, `TURN_PASSWORD`) and repeat. The existing mesh room is limited to 8 participants; load test does NOT validate SFU-scale video.

The automated `tests/rtc-signaling.test.js` covers signaling only, **not camera, microphone or network traversal**.

## 4. Payment & security smoke (staging ONLY, use fake students/transactions)

Use a fake student and payment without ever sharing secrets: verify duplicate reference causes HTTP 409, incorrect date is rejected, the amount appears in the student's history, void requires a reason and updates balance, parent sees only linked child's payments, and student gets HTTP 403 on admin finance endpoints. Admin can change a student's password with admin confirmation, and the student's previous token must then return HTTP 401.

## 5. Release decision

**GO only if:** all local integration tests pass; staging healthcheck and read-only smoke pass; backup/restore rehearsal succeeds; live media works on two real devices; user role permissions verified; Railway logs have no unexplained server errors; actual migration with copy of real data is verified; security review completed. **Otherwise NO-GO.**

Never run repeated write/payment or concurrent-load tests on the production website. Railway-backed SQLite requires a persistent Volume and tested backups; deployment with Volume may involve brief downtime.
