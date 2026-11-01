const { test } = require("node:test");
const assert = require("node:assert/strict");
const { articleFromHtml, parseLinkedInEmbed, isUnreadableCapture, isChromeDump } = require("./fetchers.cjs");
const { summarize } = require("./pipeline.cjs");

const WIKI = `<!doctype html><html><head>
<title>Software testing - Wikipedia</title>
<meta property="og:title" content="Software testing - Wikipedia">
<meta name="author" content="Wikipedia">
</head><body>
<nav>Jump to content Main menu Search Donate Create account Log in</nav>
<div id="content">
<h1>Software testing</h1>
<p>Software testing is the process of evaluating and verifying that a software product does what it is supposed to do.</p>
<h2>Goals</h2>
<p>The goals of testing are to find defects and to check that the product meets its requirements.</p>
<ul><li>Find defects early</li><li>Check the requirements</li></ul>
</div></body></html>`;

test("article extraction keeps paragraphs and drops the menu", () => {
  const art = articleFromHtml(WIKI, "https://en.wikipedia.org/wiki/Software_testing");
  assert.match(art.text, /evaluating and verifying/);
  assert.match(art.text, /## Goals/);
  assert.equal(isChromeDump(art.text), false);
  assert.doesNotMatch(art.text, /Jump to content/);
  assert.doesNotMatch(art.text, /Donate/);
});

test("a captcha page is not a note", () => {
  const reason = isUnreadableCapture({ title: "Checking your browser - reCAPTCHA", text: "Please wait" });
  assert.equal(reason, "captcha");
  assert.equal(isUnreadableCapture({ title: "Error", text: "Log in to Facebook" }), "error page");
  assert.equal(isUnreadableCapture({ title: "Instagram", text: "See everyday moments from your close friends." }), "login wall");
});

test("linkedin embed parse keeps the author, the post, and the picture", () => {
  const html = `<!doctype html><html><head>
<meta property="og:title" content="Just start. | Ivan Davidov">
<meta property="og:description" content="Just start.\n\nStop waiting for the perfect test architecture.">
<meta property="og:image" content="https://media.licdn.com/dms/image/v2/D4E22AQFexample/feedshare-shrink_800/0/1">
</head><body>
<div aria-label="View profile for Ivan Davidov" data-delayed-url="https://media.licdn.com/dms/image/v2/D5603Aavatar/profile-displayphoto-scale_400_400/0/1"></div>
<img alt="diagram" src="https://media.licdn.com/dms/image/v2/D4E22AQFexample/feedshare-shrink_800/0/1">
<img src="https://static.licdn.com/aero-v1/sc/h/chrome-icon">
</body></html>`;
  const post = parseLinkedInEmbed(html);
  assert.equal(post.author, "Ivan Davidov");
  assert.match(post.text, /perfect test architecture/);
  assert.equal(post.images.length, 1);
  assert.match(post.images[0], /feedshare/);
  assert.match(post.avatar, /profile-displayphoto/);
});

test("summarize uses Qwen and keeps the Arabic summary when the model is mocked", async () => {
  const original = global.fetch;
  let model = "";
  global.fetch = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    model = body.model;
    return {
      ok: true,
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          title: "Software testing",
          title_ar: "اختبار البرمجيات",
          content_type: "article",
          one_line: "اختبار يتحقق من أن المنتج يعمل.",
          detailed_summary: "يشرح النص أهداف الاختبار وكيف تُكتشف العيوب مبكرًا.",
          key_points: ["اكتشاف العيوب مبكرًا"],
        }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    };
  };
  try {
    const out = await summarize("test-key", {
      title: "Software testing",
      author: "Wikipedia",
      platform: "web",
      resolved_url: "https://en.wikipedia.org/wiki/Software_testing",
      text: "Software testing evaluates a product.",
      transcripts: [],
      comments: [],
      warnings: [],
    }, []);
    assert.equal(model, "qwen/qwen3.7-flash");
    assert.equal(out.parsed.title_ar, "اختبار البرمجيات");
    assert.match(out.parsed.detailed_summary, /الاختبار/);
  } finally {
    global.fetch = original;
  }
});
