const baseUrl = process.env.TRIPLOG_SMOKE_URL ?? "http://localhost:3000/";
const pagePaths = ["/", "/book"];
const scriptSources = new Set();
const pageResults = [];

for (const pagePath of pagePaths) {
  const pageUrl = new URL(pagePath, baseUrl);
  const response = await fetch(pageUrl);
  if (!response.ok) throw new Error(`${pagePath} returned HTTP ${response.status}.`);
  const html = await response.text();
  const sources = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
  if (!sources.length) throw new Error(`${pagePath} did not reference any JavaScript files.`);
  for (const source of sources) scriptSources.add(source);
  pageResults.push(pagePath);
}

const failures = [];
for (const source of scriptSources) {
  const assetUrl = new URL(source, baseUrl);
  const response = await fetch(assetUrl);
  if (!response.ok) failures.push(`${response.status} ${assetUrl.pathname}`);
}

if (failures.length) {
  throw new Error(`Landing-page JavaScript is unavailable:\n${failures.join("\n")}`);
}

console.log(`${pageResults.join(" and ")} and ${scriptSources.size} referenced JavaScript files returned HTTP 200.`);
