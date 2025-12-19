<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# ScrollSafe landing page

Next.js (App Router + Tailwind) marketing site for the ScrollSafe Chrome extension.  
All public links (Chrome Store, demo video, GitHub, privacy policy, support email) are loaded at runtime from a JSON config file so you can update copy without redeploying.

## Local development

```bash
cd scrollsafe-landing-page
npm install
npm run dev
```

Then open http://localhost:3000.

### Runtime config
The site fetches `process.env.SITE_CONFIG_URL` on every request. In development this defaults to your S3 file.  
If you want to point to a different config source locally, edit `.env.local`:

```
SITE_CONFIG_URL=https://your-bucket.s3.amazonaws.com/site-config.json
```

The JSON must contain:

```json
{
  "chromeStoreUrl": "https://chromewebstore.google.com/detail/scrollsafe/...",
  "demoUrl": "https://www.youtube.com/watch?v=...",
  "githubUrl": "https://github.com/GitHubguy97/ScrollSafe",
  "supportEmail": "support@scroll-safe.com",
  "privacyPolicyUrl": "https://githubguy97.github.io/ScrollSafe/privacy-policy.html"
}
```

Update the object in S3 and the live site reflects the change instantly—no new deployment required.
