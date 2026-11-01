/**
 * Downloads Windows yt-dlp and a small ffmpeg build into vendor-bin so the
 * NSIS package can transcribe and grab frames without a system install.
 * Skips a file that is already present.
 */
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");
const { createWriteStream } = require("fs");

const dir = path.join(__dirname, "..", "vendor-bin");
fs.mkdirSync(dir, { recursive: true });

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100000) {
    console.log("keep", path.basename(dest));
    return;
  }
  console.log("get", url);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${url} -> ${res.status}`);
  await pipeline(res.body, createWriteStream(dest));
  console.log("wrote", dest, fs.statSync(dest).size);
}

(async () => {
  await download("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe", path.join(dir, "yt-dlp.exe"));
  const ffmpegUrl = process.env.FFMPEG_WIN_URL || "https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64.gz";
  const gz = path.join(dir, "ffmpeg.exe.gz");
  try {
    await download(ffmpegUrl, gz);
    const zlib = require("zlib");
    const out = path.join(dir, "ffmpeg.exe");
    await pipeline(fs.createReadStream(gz), zlib.createGunzip(), createWriteStream(out));
    console.log("ffmpeg", fs.statSync(out).size);
  } catch (e) {
    console.warn("ffmpeg bundle skipped:", e.message);
  }
})();
