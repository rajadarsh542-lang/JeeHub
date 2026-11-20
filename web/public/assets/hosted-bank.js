/* Read paper-sized gzip members and original figures from the app's pinned GitHub dataset. */
let manifestJob;
let currentPaper;
let fallbackJob;
const fullPacks = new Map();
const firstReads = new Map();
const supportsRanges = new Set();
const assetJobs = new Map();
const maxFullPacks = 4;
const maxAssetUrls = 180;

function manifest() {
  if (!manifestJob) {
    manifestJob = window.BankFiles.json("manifest.json").then(data => {
      if (data.version !== 1 || !data.papers || !data.assets || !Array.isArray(data.files)) {
        throw new Error("Unsupported question bank format.");
      }
      return data;
    }).catch(error => { manifestJob = null; throw error; });
  }
  return manifestJob;
}

async function checkBytes(bytes, expected) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2,"0")).join("");
  if (actual !== expected) throw new Error("The question bank data failed its integrity check.");
}

function keepFullPack(name, bytes) {
  fullPacks.delete(name);
  fullPacks.set(name, bytes);
  if (fullPacks.size > maxFullPacks) fullPacks.delete(fullPacks.keys().next().value);
}

async function downloadPart(entry, pack, expected, requestRange) {
  const [name, start, size] = entry;
  const headers = requestRange ? {Range: "bytes=" + start + "-" + (start + size - 1)} : {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response, bytes;
  try {
    response = await fetch(window.BankFiles.url(name), {
      mode:"cors", credentials:"omit", referrerPolicy:"no-referrer", redirect:"error",
      headers, signal:controller.signal,
    });
    if (!response.ok) throw new Error("A question bank file could not be loaded.");
    bytes = new Uint8Array(await response.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
  let data;
  if (response.status === 206 && bytes.length === size) {
    data = bytes;
  } else if (bytes.length === pack.bytes) {
    await checkBytes(bytes, pack.sha256);
    keepFullPack(name, bytes);
    data = bytes.subarray(start, start + size);
  } else {
    throw new Error("A question bank file arrived incomplete.");
  }
  await checkBytes(data, expected);
  if (response.status === 206) supportsRanges.add(name);
  return data;
}

async function member(entry, expected, data) {
  const [name,start,size] = entry;
  const pack = data.files.find(file => file.file === name);
  if (!pack || start < 0 || size < 1 || !Number.isSafeInteger(start + size) || start + size > pack.bytes) {
    throw new Error("Invalid question bank file offset.");
  }
  // Only the first request for a new pack probes for byte-range support.
  // If the host returned the entire pack, pending figures use those same bytes.
  const pending = firstReads.get(name);
  if (pending) await pending.catch(() => {});
  const full = fullPacks.get(name);
  if (full) {
    keepFullPack(name, full);
    const slice = full.subarray(start, start + size);
    await checkBytes(slice, expected);
    return slice;
  }
  const job = (async () => {
    try {
      return await downloadPart(entry, pack, expected, true);
    } catch {
      // An intermediary may reject ranges or cache a different range of this URL.
      return downloadPart(entry, pack, expected, false);
    }
  })();
  if (!supportsRanges.has(name)) firstReads.set(name, job);
  try { return await job; }
  finally { if (firstReads.get(name) === job) firstReads.delete(name); }
}

async function decompress(data) {
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }
  if (!fallbackJob) {
    fallbackJob = new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = "/assets/gzip/pako_inflate.min.js";
      script.onload = resolve;
      script.onerror = () => {script.remove();reject(new Error("The paper decoder could not be loaded."));};
      document.head.append(script);
    }).catch(error => { fallbackJob = null; throw error; });
  }
  await fallbackJob;
  return new TextDecoder().decode(window.pako.ungzip(data));
}

export async function getQuestion(id) {
  const match = /^(?:fork:)?([a-zA-Z0-9_-]+):([1-9]\d*)$/.exec(String(id));
  if (!match) throw new Error("Unknown question.");
  const data = await manifest();
  const pid = match[1];
  const entry = Object.prototype.hasOwnProperty.call(data.papers,pid) && data.papers[pid];
  if (!entry) throw new Error("Unknown paper.");
  if (currentPaper?.id !== pid) {
    const record = {id:pid};
    currentPaper = record;
    record.job = (async () => {
      const packed = await member(entry, entry[3], data);
      const rows = JSON.parse(await decompress(packed));
      return new Map(rows.map(row => [row.id,row]));
    })().catch(error => {
      if (currentPaper === record) currentPaper = null;
      throw error;
    });
  }
  const rows = await currentPaper.job;
  const row = rows.get(id);
  if (!row) throw new Error("Unknown question.");
  return row;
}

export async function getAsset(path) {
  const isGlyph = path === "math/tex-glyphs.svg";
  const id = /^a\/([a-f0-9]{64})\.(webp|png)$/.exec(path);
  if (!isGlyph && !id) throw new Error("Unknown figure.");
  let job = assetJobs.get(path);
  if (job) {
    assetJobs.delete(path);
    assetJobs.set(path,job);
    return job;
  }
  job = (async () => {
    const data = await manifest();
    const entry = Object.prototype.hasOwnProperty.call(data.assets,path) && data.assets[path];
    if (!entry) throw new Error("Figure unavailable.");
    const bytes = await member(entry, isGlyph ? entry[3] : id[1], data);
    const mime = isGlyph ? "image/svg+xml" : "image/" + id[2];
    return URL.createObjectURL(new Blob([bytes],{type:mime}));
  })().catch(error => {
    if (assetJobs.get(path) === job) assetJobs.delete(path);
    throw error;
  });
  assetJobs.set(path,job);
  if (assetJobs.size > maxAssetUrls) {
    const oldest = assetJobs.keys().next().value;
    const stale = assetJobs.get(oldest);
    assetJobs.delete(oldest);
    stale.then(url => URL.revokeObjectURL(url), () => {});
  }
  return job;
}
