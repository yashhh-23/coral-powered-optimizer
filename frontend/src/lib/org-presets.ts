/**
 * Org preset bundles for the GSoC Matchmaker.
 * Each key is a display label shown as a chip in the UI.
 * Each value is an array of GitHub org names used to build queries.
 */
export const ORG_PRESETS: Record<string, string[]> = {
  "GSoC Popular": ["asyncapi", "zulip", "layer5io", "fossasia", "oppia"],
  "CNCF Orgs": ["kubernetes", "prometheus", "envoyproxy", "grpc", "vitessio"],
  "ML Orgs": ["tensorflow", "pytorch", "huggingface", "scikit-learn"],
  "Web Infra": ["vercel", "prisma", "remix-run", "sveltejs"],
};
