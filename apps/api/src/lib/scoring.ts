import type { AccessLevel, AccessRequestPayload } from "@mallorca/shared";

const premiumKeywords = [
  "investment",
  "family office",
  "hospitality",
  "real estate",
  "venture",
  "operator",
  "luxury",
  "fund",
  "growth"
];

export function scoreApplicant(payload: AccessRequestPayload): {
  aiPreScore: number;
  recommendedAccessLevel: AccessLevel;
} {
  const text = `${payload.whatOffer} ${payload.whatSeek} ${payload.whyJoin}`.toLowerCase();

  const keywordHits = premiumKeywords.filter((term) => text.includes(term)).length;
  const profileCompleteness = [payload.website, payload.linkedin, payload.instagram].filter(Boolean)
    .length;

  const score = Math.min(100, 45 + keywordHits * 8 + profileCompleteness * 6);

  let level: AccessLevel = "explorer";
  if (score >= 85) level = "private_circle_eligible";
  else if (score >= 78) level = "insider";
  else if (score >= 70) level = "verified";
  else if (score >= 60) level = "curated";

  return {
    aiPreScore: score,
    recommendedAccessLevel: level
  };
}
