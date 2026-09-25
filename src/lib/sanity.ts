import { createClient } from '@sanity/client'
import { ptToBody } from './pt-to-body'
import type { BlogPost } from '../data/blog'
import type {
  SeamAP,
  CertifiedProject,
  MemberOrg,
  ApprovedActivity,
} from '../data/directory'
import type { TeamMember } from '../data/team'

/**
 * Marketing content source. Content is authored in the SEAM Marketing studio
 * (project 2gezu0mx) and fetched per request so published edits appear live.
 *
 * The studio stores rich text as Portable Text; `ptToBody` serializes it back
 * to the exact markdown-ish string the existing page renderers already parse,
 * so templates render unchanged.
 */
// Read token is required: the project serves documents only to authenticated
// reads. It is server-only (never PUBLIC_), so it never reaches the browser —
// all fetches here run during SSR / build. Set SANITY_READ_TOKEN in the env
// (.env.local locally, Netlify env in production).
// Read process.env FIRST so the Netlify function picks the token up at request
// time. import.meta.env is resolved by Vite at build, so a value that only
// exists in the runtime environment gets inlined as undefined otherwise.
const token =
  process.env.SANITY_READ_TOKEN ?? import.meta.env.SANITY_READ_TOKEN ?? undefined

export const sanity = createClient({
  projectId:
    process.env.SANITY_PROJECT_ID ?? import.meta.env.PUBLIC_SANITY_PROJECT_ID ?? '2gezu0mx',
  dataset:
    process.env.SANITY_DATASET ?? import.meta.env.PUBLIC_SANITY_DATASET ?? 'production',
  apiVersion: '2025-01-01',
  token,
  // Published-content reads only (no drafts, no preview, no mutations), so serve
  // them from the API CDN (apicdn.sanity.io). The CDN caches authenticated
  // requests per token and Sanity purges it on publish, so edits still appear
  // within seconds. useCdn: false sent every SSR render to the uncached API.
  useCdn: true,
  perspective: 'published',
})

// Per-instance memo. One page render runs the same queries more than once
// (Navbar pulls APs/projects/orgs on every page, and the directory pages pull
// them again), and a warm function serves many renders. Sharing the in-flight
// promise for a short window collapses those into one CDN request.
const MEMO_TTL_MS = 60_000
const memo = new Map<string, { at: number; value: Promise<any> }>()
function cachedFetch<T>(query: string, params: Record<string, unknown> = {}): Promise<T> {
  const key = query + JSON.stringify(params)
  const hit = memo.get(key)
  if (hit && Date.now() - hit.at < MEMO_TTL_MS) return hit.value
  const value = sanity.fetch<T>(query, params)
  memo.set(key, { at: Date.now(), value })
  // Never memoize a failure — the next render should retry.
  value.catch(() => memo.delete(key))
  return value
}

// ── GROQ projections (shapes match SEAM/src/data interfaces) ─────────────────
const POST = `{
  "slug": slug.current, title, excerpt, category, author, "date": date,
  readTime, featured, "image": { "src": image.asset->url, "alt": image.alt }, body
}`
// Array fields are coalesced to []. An empty field in the Studio comes back as
// null, and consumers spread/.map these directly (the data/ interfaces declare
// them as arrays) — so an unfilled field would otherwise throw mid-render and
// truncate the SSR stream. Same resilience contract as safeFetch below.
const AP = `{
  "slug": slug.current, name, "photo": photo.asset->url, title, organization,
  location, "specialties": coalesce(specialties, []), bio, credentials,
  membershipTier, "roles": coalesce(roles, []), linkedIn, website,
  dateCredentialed, projectsLed
}`
const ORG = `{
  "slug": slug.current, name, "logo": logo.asset->url, tier, description, location,
  website, "sectors": coalesce(sectors, [])
}`
const PROJECT = `{
  "slug": slug.current, name, "image": image.asset->url, location, certificationLevel,
  ratingSystem, description, completionDate, size, owner,
  "highlights": coalesce(highlights, []),
  "apLead": apLead->slug.current,
  "blogPost": select(defined(blogPost) => "/resources/blog/" + blogPost->slug.current),
  website
}`
const ACTIVITY = `{
  "slug": slug.current, name, organization, category, pillar, description,
  dateApproved, location
}`
const TEAM = `{
  "slug": slug.current, name, role, bio, "image": image.asset->url, imagePosition,
  linkedIn, order
}`

// ── Getters (per-request fetch + shape mapping) ──────────────────────────────
// Every getter is resilient: if Sanity is unreachable or the token is bad, it
// logs and returns [] rather than throwing, so a CMS problem degrades to empty
// sections instead of taking the whole marketing site down with a 500.
async function safeFetch<T>(label: string, query: string): Promise<T[]> {
  try {
    return (await cachedFetch<T[]>(query)) ?? []
  } catch (e: any) {
    console.error(`[sanity] ${label} failed: ${e?.message ?? e}`)
    return []
  }
}

export async function getPosts(): Promise<BlogPost[]> {
  const rows = await safeFetch<any>('getPosts', `*[_type=="blogPost"]|order(date desc)${POST}`)
  return rows.map((p) => ({
    ...p,
    image: p.image?.src ? p.image : undefined,
    body: ptToBody(p.body),
  }))
}

export async function getSeamAPs(): Promise<SeamAP[]> {
  return safeFetch<SeamAP>('getSeamAPs', `*[_type=="seamAP"]|order(name asc)${AP}`)
}

export async function getMemberOrgs(): Promise<MemberOrg[]> {
  return safeFetch<MemberOrg>('getMemberOrgs', `*[_type=="memberOrg"]|order(name asc)${ORG}`)
}

export async function getCertifiedProjects(): Promise<CertifiedProject[]> {
  return safeFetch<CertifiedProject>('getCertifiedProjects', `*[_type=="certifiedProject"]|order(name asc)${PROJECT}`)
}

export async function getApprovedActivities(): Promise<ApprovedActivity[]> {
  return safeFetch<ApprovedActivity>('getApprovedActivities', `*[_type=="approvedActivity"]|order(name asc)${ACTIVITY}`)
}

export async function getTeam(): Promise<TeamMember[]> {
  const rows = await safeFetch<any>('getTeam', `*[_type=="teamMember"]|order(order asc)${TEAM}`)
  return rows.map((t) => ({ ...t, bio: ptToBody(t.bio) }))
}

// ── Page builder ─────────────────────────────────────────────────────────────
// A page = an ordered list of section blocks. `...` spreads every section's
// fields; image assets are resolved to URLs. Portable Text fields (richText
// body, faq answers) come through raw and are rendered in the section component.
const PAGE = `{
  title, "slug": slug.current, seo,
  sections[]{
    ...,
    // hero uses a Sanity image asset; imageText/etc. use a string path — keep both
    "image": select(defined(image.asset) => image.asset->url, image)
  }
}`

export type Page = {
  title: string
  slug: string
  seo?: { title?: string; description?: string; ogImage?: any; noindex?: boolean }
  sections?: any[]
}

export async function getPage(slug: string): Promise<Page | null> {
  try {
    return await cachedFetch<Page | null>(
      `*[_type=="page" && slug.current==$slug][0]${PAGE}`,
      { slug },
    )
  } catch (e: any) {
    console.error(`[sanity] getPage(${slug}) failed: ${e?.message ?? e}`)
    return null
  }
}

export async function getPageSlugs(): Promise<string[]> {
  const rows = await safeFetch<{ slug: string }>(
    'getPageSlugs',
    `*[_type=="page" && defined(slug.current)]{ "slug": slug.current }`,
  )
  return rows.map((r) => r.slug)
}
