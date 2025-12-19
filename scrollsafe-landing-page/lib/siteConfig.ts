export type SiteConfig = {
  chromeStoreUrl: string;
  demoUrl: string;
  githubUrl: string;
  supportEmail: string;
  privacyPolicyUrl: string;
  heroDemoGifUrl: string;
};

const DEFAULT_CONFIG: SiteConfig = {
  chromeStoreUrl:
    "https://chromewebstore.google.com/detail/scrollsafe/ealjbgmebfknfngloiabmjpmkbphakfj",
  demoUrl: "https://www.youtube.com/watch?v=AbBsdleg8IQ",
  githubUrl: "https://github.com/GitHubguy97/ScrollSafe",
  supportEmail: "support@scroll-safe.com",
  privacyPolicyUrl: "https://githubguy97.github.io/ScrollSafe/privacy-policy.html",
  heroDemoGifUrl: "https://picsum.photos/id/48/1200/800",
};

function isProbablyUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isSiteConfig(value: unknown): value is SiteConfig {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;

  return (
    isProbablyUrl(obj.chromeStoreUrl) &&
    isProbablyUrl(obj.demoUrl) &&
    isProbablyUrl(obj.githubUrl) &&
    typeof obj.supportEmail === "string" &&
    obj.supportEmail.length > 3 &&
    isProbablyUrl(obj.privacyPolicyUrl) &&
    isProbablyUrl(obj.heroDemoGifUrl)
  );
}

export async function getSiteConfig(): Promise<SiteConfig> {
  const url =
    process.env.SITE_CONFIG_URL ??
    "https://scrollsafe-site-config.s3.us-east-2.amazonaws.com/site-config.json";

  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return DEFAULT_CONFIG;
    const data = (await response.json()) as unknown;
    return isSiteConfig(data) ? data : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}
