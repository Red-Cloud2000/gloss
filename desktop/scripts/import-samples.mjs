const base = "http://127.0.0.1:3921";

const jobs = [
  ["web", "https://en.wikipedia.org/wiki/Software_testing"],
  ["github", "https://github.com/nutlope/gloss"],
  ["pdf", "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
  ["youtube", "https://www.youtube.com/watch?v=jNQXAC9IVRw"],
  ["x", "https://x.com/jack/status/20"],
  ["linkedin", "https://www.linkedin.com/company/wikipedia"],
  ["facebook", "https://www.facebook.com/wikipedia"],
  ["instagram", "https://www.instagram.com/wikipedia/"],
  ["personal", "https://www.amazon.com/gp/your-account/order-details?id_order=99"],
];

async function one(name, url) {
  const started = Date.now();
  if (name === "text") return;
  const res = await fetch(`${base}/api/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const body = await res.json();
  if (!body.jobId) {
    return { name, url, ms: Date.now() - started, ...body };
  }
  const deadline = Date.now() + (name === "youtube" ? 180000 : 90000);
  let job = body;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    const j = await fetch(`${base}/api/jobs/${body.jobId}`);
    job = await j.json();
    if (job.status === "done" || job.status === "error") break;
  }
  let item = null;
  if (job.itemId) {
    const it = await fetch(`${base}/api/items/${job.itemId}`);
    if (it.ok) {
      const data = await it.json();
      item = {
        id: data.item?.id,
        platform: data.item?.platform,
        title: data.item?.title,
        url: data.item?.original_url,
        text: (data.raw?.post_text || "").slice(0, 180),
        transcript: (data.raw?.transcript || "").slice(0, 180),
        media: (data.item?.media_files || []).slice(0, 6),
        summary: (data.item?.detailed_summary || "").slice(0, 160),
      };
    }
  }
  return { name, url, ms: Date.now() - started, status: job.status, error: job.error, needsLogin: job.needsLogin, item };
}

const textRes = await fetch(`${base}/api/import`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ title: "Pasted note", text: "This is a pasted note about software testing.\n\nIt should render as a Gloss article." }),
});
const textBody = await textRes.json();

const results = [{ name: "text", ...textBody }];
for (const [name, url] of jobs) {
  process.stdout.write(`import ${name}…\n`);
  try {
    const row = await one(name, url);
    results.push(row);
    process.stdout.write(`${name} ${row.status || row.itemId || row.error} ${row.ms || ""}ms\n`);
  } catch (e) {
    results.push({ name, url, error: String(e) });
    process.stdout.write(`${name} FAIL ${e}\n`);
  }
}

const boot = await fetch(`${base}/api/bootstrap`).then((r) => r.json());
const personal = (boot.failed || []).filter((f) => f.reason === "skipped: personal/transactional link" || /id_order/.test(f.url || ""));
results.push({ personalLeaks: personal.length, items: boot.counts?.items, failed: boot.counts?.failed });
console.log(JSON.stringify(results, null, 2));
