import type { APIRoute } from 'astro'
import {
  getPosts,
  getSeamAPs,
  getCertifiedProjects,
  getMemberOrgs,
  getTeam,
} from '../lib/sanity'

const SITE = 'https://seamcertification.org'

function entry(loc: string, opts?: { lastmod?: string; changefreq?: string; priority?: number }) {
  let xml = `  <url>\n    <loc>${SITE}${loc}</loc>`
  if (opts?.lastmod) xml += `\n    <lastmod>${opts.lastmod}</lastmod>`
  if (opts?.changefreq) xml += `\n    <changefreq>${opts.changefreq}</changefreq>`
  if (opts?.priority != null) xml += `\n    <priority>${opts.priority}</priority>`
  xml += `\n  </url>`
  return xml
}

export const GET: APIRoute = async () => {
  const [posts, seamAPs, certifiedProjects, memberOrgs, team] = await Promise.all([
    getPosts(),
    getSeamAPs(),
    getCertifiedProjects(),
    getMemberOrgs(),
    getTeam(),
  ])

  const urls: string[] = []

  // Core pages
  const staticPages = [
    { path: '/', priority: 1.0, changefreq: 'weekly' },
    { path: '/about', priority: 0.7, changefreq: 'monthly' },
    { path: '/contact', priority: 0.6, changefreq: 'monthly' },
    { path: '/get-started', priority: 0.8, changefreq: 'monthly' },
    { path: '/pricing', priority: 0.8, changefreq: 'monthly' },
    { path: '/faq', priority: 0.6, changefreq: 'monthly' },
    { path: '/privacy', priority: 0.3, changefreq: 'yearly' },
    { path: '/terms', priority: 0.3, changefreq: 'yearly' },
    { path: '/social-equity-101', priority: 0.8, changefreq: 'monthly' },
    { path: '/social-sustainability', priority: 0.8, changefreq: 'monthly' },
    { path: '/seam-ap-vs-leed-ap', priority: 0.8, changefreq: 'monthly' },
    { path: '/pathways', priority: 0.7, changefreq: 'monthly' },
    // Solutions
    { path: '/certification', priority: 0.9, changefreq: 'monthly' },
    { path: '/ap-credential', priority: 0.9, changefreq: 'monthly' },
    // Rating systems
    { path: '/rating-system', priority: 0.7, changefreq: 'monthly' },
    { path: '/rating-system/buildings-interiors', priority: 0.7, changefreq: 'monthly' },
    { path: '/rating-system/operations-maintenance', priority: 0.7, changefreq: 'monthly' },
    // Standard pillars
    { path: '/standard/social-impact', priority: 0.6, changefreq: 'monthly' },
    { path: '/standard/social-responsibility', priority: 0.6, changefreq: 'monthly' },
    { path: '/standard/social-justice', priority: 0.6, changefreq: 'monthly' },
    { path: '/standard/social-accountability', priority: 0.6, changefreq: 'monthly' },
    // Membership
    { path: '/membership', priority: 0.8, changefreq: 'monthly' },
    { path: '/membership/individual', priority: 0.7, changefreq: 'monthly' },
    { path: '/membership/organization', priority: 0.7, changefreq: 'monthly' },
    // Resources
    { path: '/resources/standard', priority: 0.7, changefreq: 'monthly' },
    { path: '/resources/rossi', priority: 0.7, changefreq: 'monthly' },
    { path: '/resources/leed-crosswalk', priority: 0.6, changefreq: 'monthly' },
    { path: '/resources/roi', priority: 0.6, changefreq: 'monthly' },
    { path: '/resources/courses', priority: 0.7, changefreq: 'monthly' },
    { path: '/resources/courses/foundations', priority: 0.7, changefreq: 'monthly' },
    { path: '/resources/courses/cre-familiarization', priority: 0.6, changefreq: 'monthly' },
    { path: '/resources/integrations', priority: 0.5, changefreq: 'monthly' },
    { path: '/resources/social-sustainability-examples', priority: 0.7, changefreq: 'monthly' },
    { path: '/resources/blog', priority: 0.8, changefreq: 'weekly' },
    // Audience pages
    { path: '/for/developers-owners', priority: 0.7, changefreq: 'monthly' },
    { path: '/for/building-professionals', priority: 0.7, changefreq: 'monthly' },
    { path: '/for/operators', priority: 0.7, changefreq: 'monthly' },
    { path: '/for/capital-providers', priority: 0.7, changefreq: 'monthly' },
    { path: '/for/impact-professionals', priority: 0.7, changefreq: 'monthly' },
    { path: '/for/people', priority: 0.7, changefreq: 'monthly' },
    // Directory
    { path: '/directory', priority: 0.8, changefreq: 'weekly' },
  ]

  for (const page of staticPages) {
    urls.push(entry(page.path, { priority: page.priority, changefreq: page.changefreq }))
  }

  // Blog posts
  for (const post of posts) {
    urls.push(entry(`/resources/blog/${post.slug}`, {
      lastmod: post.date,
      changefreq: 'monthly',
      priority: 0.6,
    }))
  }

  // Directory: SEAM APs
  for (const ap of seamAPs) {
    urls.push(entry(`/directory/ap/${ap.slug}`, { changefreq: 'monthly', priority: 0.5 }))
  }

  // Directory: Certified Projects
  for (const project of certifiedProjects) {
    urls.push(entry(`/directory/project/${project.slug}`, { changefreq: 'monthly', priority: 0.5 }))
  }

  // Directory: Member Organizations
  for (const org of memberOrgs) {
    urls.push(entry(`/directory/org/${org.slug}`, { changefreq: 'monthly', priority: 0.5 }))
  }

  // Team members
  for (const member of team) {
    urls.push(entry(`/directory/team/${member.slug}`, { changefreq: 'monthly', priority: 0.4 }))
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
