# Nihongo Learning API

## Local setup

1. In MySQL Workbench, run `database/schema.sql`, then `database/seed.sql` against MySQL 8.
2. In this folder, copy `.env.example` to `.env`; fill in MySQL credentials and a private `JWT_SECRET` of at least 32 characters.
3. `database/seed.sql` directly imports the full checked-in vocabulary and Kanji datasets plus the sample courses and learning content. In this folder, run `npm install`, `npm run db:migrate`, then `npm run seed` to apply the remaining migrations, link lessons by JLPT level, and safely synchronize those datasets from JSON.
4. Run `npm run dev`. The website is served at `http://localhost:3000` and the health endpoint is `http://localhost:3000/api/health`.
5. To attach a lesson or grammar video, choose an MP4/WebM file in its admin form and save. Files up to 500 MB are stored under `backend/uploads/videos`; they are not sent to an external service. The server uses FFmpeg and FFprobe to generate a separate preview capped at five minutes. Install both tools and make them available on `PATH`, or set `FFMPEG_PATH` and `FFPROBE_PATH`.
6. Admins can upload PDF, DOCX and TXT study materials in the library. Learners can read materials allowed by their course access; the reader restores each account's saved page and scroll position.
7. If the API is hosted on another origin, set `window.NIHONGO_API_BASE` before page scripts and add that origin to `CORS_ORIGIN`.

The sample user records in `database/seed.sql` have placeholder password hashes and cannot log in. Register a real account through the site, then promote only that account to admin in MySQL:

```sql
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'admin')
WHERE email = 'your-admin-email@example.com';
```

Video fields on lessons and grammar points store the path returned by the authenticated video-upload API. Only MP4 and WebM files are accepted. The player provides native playback controls and 10-second seek buttons. Japanese pronunciation uses the browser's speech synthesis voices when available.

The API applies authorization on every protected request. Client-side admin visibility is only a convenience and is not an authorization boundary.

Course cover images are checked-in files under `assets/images/`; the `courses.image_url` value stores their served path. `npm run seed` imports 674 vocabulary entries and 118 Kanji from the checked-in datasets and is safe to rerun.

## VNPay Sandbox

Keep the merchant code and hash secret in the ignored `backend/.env`, never in frontend code or checked-in files. Set `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, and `VNPAY_URL` from the Sandbox merchant account. Checkout remains disabled until `APP_PUBLIC_URL` is an externally reachable HTTPS origin. Configure the VNPay merchant IPN URL as `{APP_PUBLIC_URL}/api/payments/vnpay/ipn`; the return URL is constructed by the backend. A local `localhost` URL cannot receive IPN callbacks. Enrollment is activated only after the backend verifies the signed IPN, not from the browser return page.

Feedback is private until moderation. Public testimonials include only reviews that are both approved and tied to verified learner activity.

Paid video playback uses a signed, video-scoped URL that expires after two hours because native browser video requests cannot attach the account's Bearer token. The URL grants access only to the specific video; video request URLs are omitted from access logs.

## Deploying to Vercel

The repository root is the Vercel project root. The root `package.json` and `vercel.json` install the backend dependencies, export the Express app as a Vercel function, and build the checked-in site files into `public/`. The Vercel output directory is `.` so the Express entrypoint at the repository root is discovered; `public/` only contains static assets.

1. Push the repository to GitHub and import it into Vercel. Set the Root Directory to the repository root and keep the Build Command and Output Directory values from `vercel.json`.
2. Create a reachable MySQL 8 database with a provider that accepts connections from Vercel. Run `database/schema.sql` and `database/seed.sql` against it.
3. Add these environment variables in the Vercel project settings: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` (at least 32 characters), and `NODE_ENV=production`. The database connection also accepts provider variable names `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, and `MYSQLPASSWORD`. Set `CORS_ORIGIN` to any custom website origin; the default Vercel deployment domains are allowed automatically.
4. Add `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`, `VNPAY_URL`, and `APP_PUBLIC_URL` only when configuring VNPay. Keep credentials in Vercel environment settings, not in frontend files.
5. Redeploy after adding the environment variables and verify `/api/health`.

Vercel Functions do not provide durable local file storage or the FFmpeg executables used by this project. The app skips creating local upload directories on Vercel and returns `503` from video and document upload endpoints until durable object storage is configured; video processing also needs a compatible service. Existing database records remain in the external MySQL database.
