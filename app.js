const library = document.querySelector("#fragmentLibrary");
const canvas = document.querySelector("#poetryCanvas");
const morandiWheel = document.querySelector("#morandiWheel");
const wheelHandle = document.querySelector("#wheelHandle");
const overlay = document.querySelector("#exportOverlay");
const exportPreview = document.querySelector("#exportPreview");
const infoOverlay = document.querySelector("#infoOverlay");
const infoTitle = document.querySelector("#infoTitle");
const infoBody = document.querySelector("#infoBody");
const closeInfoOverlay = document.querySelector("#closeInfoOverlay");
const songSearchInput = document.querySelector("#songSearchInput");
const songSearchButton = document.querySelector("#songSearchButton");
const presetBackgrounds = {
  lined: window.PRESET_BACKGROUND_DATA?.lined || "./assets/canvas-paper-lined.jpg",
  white: window.PRESET_BACKGROUND_DATA?.white || "./assets/canvas-paper-white.jpg",
  black: window.PRESET_BACKGROUND_DATA?.black || "./assets/canvas-paper-black.jpg"
};
const lyricRows = Array.isArray(window.LYRIC_ROWS) ? window.LYRIC_ROWS : [];
let lyricGroups = [];
let groupIndex = 0;
let selected = null;
let zCounter = 3;
let draggedLibraryStrip = null;
let bgImage = null;
let currentPreset = "lined";
let currentColor = "#f7f2e8";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function splitText(text) {
  const compact = text.trim();
  if (/\s/.test(compact)) return compact.split(/(\s+)/).filter(Boolean);
  return Array.from(compact);
}

function shuffleRows(rows) {
  const shuffled = [...rows];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function buildRandomGroups() {
  const shuffled = shuffleRows(lyricRows);
  if (shuffled.length <= 20) return [shuffled];

  const minGroups = Math.ceil(shuffled.length / 20);
  const maxGroups = Math.floor(shuffled.length / 15);
  const groupCount = minGroups + Math.floor(Math.random() * (maxGroups - minGroups + 1));
  const sizes = Array.from({ length: groupCount }, () => 15);
  let remaining = shuffled.length - groupCount * 15;

  while (remaining > 0) {
    const candidates = sizes
      .map((size, index) => ({ size, index }))
      .filter((item) => item.size < 20);
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    sizes[picked.index] += 1;
    remaining -= 1;
  }

  const groups = [];
  let index = 0;
  sizes.forEach((size) => {
    groups.push(shuffled.slice(index, index + size));
    index += size;
  });
  return groups;
}

function normalizeSongName(name) {
  return String(name || "").trim().toLocaleLowerCase();
}

function getSongNames() {
  const names = [];
  const seen = new Set();
  lyricRows.forEach((row) => {
    const song = String(row.song || "").trim();
    const key = normalizeSongName(song);
    if (!song || seen.has(key)) return;
    seen.add(key);
    names.push(song);
  });
  return names;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLibrary(rows) {
  library.innerHTML = "";
  rows.forEach((row) => addLibraryStrip(row.text));
}

function renderCurrentGroup() {
  if (!lyricGroups.length) lyricGroups = buildRandomGroups();
  renderLibrary(lyricGroups[groupIndex] || []);
}

function addLibraryStrip(text, color = "#f7f2e8") {
  const strip = document.createElement("div");
  strip.className = "strip library-strip";
  strip.draggable = true;
  strip.dataset.text = text;
  strip.dataset.color = color;
  strip.style.setProperty("--strip-bg", color);
  strip.innerHTML = `<span class="strip-text"></span><button class="scissor" type="button" aria-label="裁切">✂</button>`;
  strip.querySelector(".strip-text").textContent = text;
  library.appendChild(strip);
}

function showCutTokens(strip, parts) {
  const textEl = strip.querySelector(".strip-text");
  textEl.textContent = "";
  parts.forEach((part, index) => {
    const token = document.createElement("span");
    token.dataset.index = index;
    token.textContent = part;
    textEl.appendChild(token);
  });
}

function selectStrip(strip) {
  document.querySelectorAll(".strip.selected").forEach((node) => node.classList.remove("selected"));
  selected = strip;
  if (strip) {
    strip.classList.add("selected");
    currentColor = strip.dataset.color || "#f7f2e8";
    if (strip.classList.contains("canvas-strip")) {
      strip.style.zIndex = ++zCounter;
    }
  }
}

function makeCanvasStrip(text, color, x, y) {
  const strip = document.createElement("div");
  strip.className = "strip canvas-strip";
  strip.dataset.id = uid();
  strip.dataset.text = text;
  strip.dataset.color = color;
  strip.dataset.x = x;
  strip.dataset.y = y;
  strip.dataset.rotation = (Math.random() * 10 - 5).toFixed(2);
  strip.dataset.scale = "1";
  strip.style.setProperty("--strip-bg", color);
  strip.style.zIndex = ++zCounter;
  strip.innerHTML = `<span class="strip-text"></span><button class="delete-strip" type="button" aria-label="删除">×</button>`;
  strip.querySelector(".strip-text").textContent = text;
  canvas.appendChild(strip);
  updateTransform(strip);
  selectStrip(strip);
  enableCanvasDrag(strip);
}

function updateTransform(strip) {
  strip.style.left = `${strip.dataset.x}px`;
  strip.style.top = `${strip.dataset.y}px`;
  strip.style.transform = `rotate(${strip.dataset.rotation}deg) scale(${strip.dataset.scale})`;
}

function hslToHex(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)]
    .map((value) => Math.round(255 * value).toString(16).padStart(2, "0"))
    .join("")
    .replace(/^/, "#");
}

function tintSelectedStrip(color) {
  currentColor = color;
  wheelHandle.style.backgroundColor = color;
  if (!selected) return;
  selected.dataset.color = color;
  selected.style.setProperty("--strip-bg", color);
}

function moveWheelHandle(clientX, clientY) {
  const rect = morandiWheel.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const radius = Math.min(Math.hypot(dx, dy), rect.width * 0.43);
  const angle = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  const softness = radius / (rect.width * 0.43);
  const saturation = 9 + softness * 18;
  const lightness = 88 - softness * 10;
  wheelHandle.style.transform = `translate(${Math.cos(angle * Math.PI / 180) * radius}px, ${Math.sin(angle * Math.PI / 180) * radius}px)`;
  morandiWheel.setAttribute("aria-valuenow", Math.round(angle));
  tintSelectedStrip(hslToHex(angle, saturation, lightness));
}

function enableCanvasDrag(strip) {
  let start = null;
  strip.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".delete-strip")) return;
    selectStrip(strip);
    strip.setPointerCapture(event.pointerId);
    start = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: Number(strip.dataset.x),
      y: Number(strip.dataset.y)
    };
  });
  strip.addEventListener("pointermove", (event) => {
    if (!start) return;
    const rect = canvas.getBoundingClientRect();
    strip.dataset.x = Math.max(0, Math.min(rect.width - 24, start.x + event.clientX - start.pointerX));
    strip.dataset.y = Math.max(0, Math.min(rect.height - 24, start.y + event.clientY - start.pointerY));
    updateTransform(strip);
  });
  strip.addEventListener("pointerup", () => {
    start = null;
  });
  strip.addEventListener("pointercancel", () => {
    start = null;
  });
}

function cutLibraryStrip(strip, index) {
  const text = strip.dataset.text;
  const parts = splitText(text);
  const left = parts.slice(0, index + 1).join("").trim();
  const right = parts.slice(index + 1).join("").trim();
  if (!left || !right) return;
  strip.remove();
  addLibraryStrip(left, strip.dataset.color);
  addLibraryStrip(right, strip.dataset.color);
}

library.addEventListener("click", (event) => {
  const strip = event.target.closest(".library-strip");
  if (!strip) return;
  selectStrip(strip);
  if (event.target.closest(".scissor")) {
    const textEl = strip.querySelector(".strip-text");
    const parts = splitText(strip.dataset.text);
    strip.classList.toggle("cutting");
    if (strip.classList.contains("cutting")) {
      showCutTokens(strip, parts);
    } else {
      textEl.textContent = strip.dataset.text;
    }
    return;
  }
  const token = event.target.closest(".strip-text span");
  if (token && strip.classList.contains("cutting")) {
    cutLibraryStrip(strip, Number(token.dataset.index));
  }
});

library.addEventListener("dblclick", (event) => {
  const strip = event.target.closest(".library-strip");
  if (!strip || event.target.closest(".scissor")) return;
  const rect = canvas.getBoundingClientRect();
  makeCanvasStrip(strip.dataset.text, strip.dataset.color, rect.width * 0.25 + Math.random() * 80, rect.height * 0.22 + Math.random() * 120);
});

library.addEventListener("dragstart", (event) => {
  const strip = event.target.closest(".library-strip");
  if (!strip) return;
  draggedLibraryStrip = strip;
  event.dataTransfer.setData("text/plain", strip.dataset.text);
});

canvas.addEventListener("dragover", (event) => event.preventDefault());
canvas.addEventListener("drop", (event) => {
  event.preventDefault();
  if (!draggedLibraryStrip) return;
  const rect = canvas.getBoundingClientRect();
  makeCanvasStrip(
    draggedLibraryStrip.dataset.text,
    draggedLibraryStrip.dataset.color,
    event.clientX - rect.left - 35,
    event.clientY - rect.top - 18
  );
  draggedLibraryStrip = null;
});

canvas.addEventListener("click", (event) => {
  if (event.target === canvas) selectStrip(null);
  const del = event.target.closest(".delete-strip");
  if (del) {
    del.closest(".canvas-strip").remove();
    selected = null;
  }
});

canvas.addEventListener("wheel", (event) => {
  if (!selected || !selected.classList.contains("canvas-strip")) return;
  event.preventDefault();
  if (event.shiftKey) {
    selected.dataset.scale = Math.max(0.55, Math.min(2.2, Number(selected.dataset.scale) + (event.deltaY < 0 ? 0.05 : -0.05))).toFixed(2);
  } else {
    selected.dataset.rotation = (Number(selected.dataset.rotation) + (event.deltaY < 0 ? -2 : 2)).toFixed(2);
  }
  updateTransform(selected);
}, { passive: false });

let pinch = null;
canvas.addEventListener("touchstart", (event) => {
  if (!selected || !selected.classList.contains("canvas-strip") || event.touches.length !== 2) return;
  const [a, b] = event.touches;
  pinch = {
    distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
    angle: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
    scale: Number(selected.dataset.scale),
    rotation: Number(selected.dataset.rotation)
  };
}, { passive: true });

canvas.addEventListener("touchmove", (event) => {
  if (!pinch || !selected || event.touches.length !== 2) return;
  event.preventDefault();
  const [a, b] = event.touches;
  const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const angle = Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  selected.dataset.scale = Math.max(0.55, Math.min(2.2, pinch.scale * (distance / pinch.distance))).toFixed(2);
  selected.dataset.rotation = (pinch.rotation + (angle - pinch.angle) * 180 / Math.PI).toFixed(2);
  updateTransform(selected);
}, { passive: false });

canvas.addEventListener("touchend", () => {
  pinch = null;
});

morandiWheel.addEventListener("pointerdown", (event) => {
  morandiWheel.setPointerCapture(event.pointerId);
  moveWheelHandle(event.clientX, event.clientY);
});

morandiWheel.addEventListener("pointermove", (event) => {
  if (!morandiWheel.hasPointerCapture(event.pointerId)) return;
  moveWheelHandle(event.clientX, event.clientY);
});

morandiWheel.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 24 : 8;
  const value = Number(morandiWheel.getAttribute("aria-valuenow") || 38);
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const next = event.key === "ArrowRight" ? value + step : value - step;
  tintSelectedStrip(hslToHex((next + 360) % 360, 20, 82));
  morandiWheel.setAttribute("aria-valuenow", Math.round((next + 360) % 360));
});

document.querySelectorAll(".swatch").forEach((button) => {
  button.addEventListener("click", () => {
    tintSelectedStrip(button.dataset.color);
  });
});

document.querySelector("#shuffleSet").addEventListener("click", () => {
  songSearchInput.value = "";
  groupIndex += 1;
  if (groupIndex >= lyricGroups.length) {
    lyricGroups = buildRandomGroups();
    groupIndex = 0;
  }
  renderCurrentGroup();
});

function searchBySongName() {
  const query = normalizeSongName(songSearchInput.value);
  if (!query) {
    renderCurrentGroup();
    return;
  }
  const exact = lyricRows.filter((row) => normalizeSongName(row.song) === query);
  const partial = exact.length ? exact : lyricRows.filter((row) => normalizeSongName(row.song).includes(query));
  renderLibrary(partial);
}

songSearchButton.addEventListener("click", searchBySongName);
songSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") searchBySongName();
});

function applyCanvasPreset(preset) {
  currentPreset = preset;
  bgImage = null;
  canvas.dataset.bg = preset;
  canvas.classList.remove("has-image");
  canvas.style.backgroundImage = "";
  document.querySelectorAll(".preset[data-bg]").forEach((item) => {
    item.classList.toggle("active", item.dataset.bg === preset);
  });
}

document.querySelectorAll(".preset").forEach((button) => {
  button.addEventListener("click", () => {
    applyCanvasPreset(button.dataset.bg);
  });
});

document.querySelector("#bgUpload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    bgImage = reader.result;
    currentPreset = null;
    canvas.classList.add("has-image");
    delete canvas.dataset.bg;
    canvas.style.backgroundImage = `url("${bgImage}")`;
    document.querySelectorAll(".preset").forEach((item) => item.classList.remove("active"));
  };
  reader.readAsDataURL(file);
});

document.querySelector("#clearCanvas").addEventListener("click", () => {
  canvas.querySelectorAll(".canvas-strip").forEach((strip) => strip.remove());
});

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const chars = Array.from(text);
  let line = "";
  let yy = y;
  chars.forEach((char) => {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = char;
      yy += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, yy);
}

function drawTapeShape(ctx, x, y, width, height) {
  const teeth = [
    [0.012, 0],
    [0.98, 0],
    [1, 0.09],
    [0.986, 0.17],
    [1, 0.28],
    [0.987, 0.39],
    [1, 0.5],
    [0.984, 0.61],
    [1, 0.73],
    [0.985, 0.86],
    [1, 1],
    [0.016, 1],
    [0, 0.91],
    [0.013, 0.81],
    [0, 0.68],
    [0.011, 0.55],
    [0, 0.43],
    [0.015, 0.31],
    [0, 0.18],
    [0.012, 0.08]
  ];
  ctx.beginPath();
  teeth.forEach(([px, py], index) => {
    const tx = x + width * px;
    const ty = y + height * py;
    if (index === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  });
  ctx.closePath();
  ctx.fill();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawCoverImage(ctx, img, rect) {
  const ratio = Math.max(rect.width / img.width, rect.height / img.height);
  const w = img.width * ratio;
  const h = img.height * ratio;
  ctx.drawImage(img, (rect.width - w) / 2, (rect.height - h) / 2, w, h);
}

function getStripExportMetrics(strip) {
  const textEl = strip.querySelector(".strip-text");
  const stripStyle = getComputedStyle(strip);
  const textStyle = getComputedStyle(textEl);
  const textRect = textEl.getBoundingClientRect();
  return {
    width: strip.offsetWidth,
    height: strip.offsetHeight,
    textX: textEl.offsetLeft,
    textY: textEl.offsetTop,
    textWidth: Math.ceil(textRect.width),
    lineHeight: Number.parseFloat(textStyle.lineHeight) || 20,
    font: textStyle.font || "15px Songti SC, STSong, Georgia, serif",
    color: stripStyle.color || "#3d342c"
  };
}

async function exportCanvas() {
  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const rect = canvas.getBoundingClientRect();
    const scale = 3;
    const out = document.createElement("canvas");
    out.width = Math.round(rect.width * scale);
    out.height = Math.round(rect.height * scale);
    const ctx = out.getContext("2d");
    ctx.scale(scale, scale);

    const imageSrc = bgImage || (currentPreset ? presetBackgrounds[currentPreset] : null);
    if (imageSrc) {
      const img = await loadImage(imageSrc);
      drawCoverImage(ctx, img, rect);
    } else {
      ctx.fillStyle = "#e8ecea";
      ctx.fillRect(0, 0, rect.width, rect.height);
    }

    const strips = [...canvas.querySelectorAll(".canvas-strip")].sort((a, b) => Number(a.style.zIndex) - Number(b.style.zIndex));
    strips.forEach((strip) => {
      const x = Number(strip.dataset.x);
      const y = Number(strip.dataset.y);
      const rotation = Number(strip.dataset.rotation) * Math.PI / 180;
      const stripScale = Number(strip.dataset.scale);
      const text = strip.dataset.text;
      const metrics = getStripExportMetrics(strip);
      ctx.font = metrics.font;
      const singleLineWidth = Math.ceil(ctx.measureText(text).width + metrics.textX * 2 + 8);
      const width = Math.max(metrics.width, singleLineWidth);
      const height = metrics.height;
      ctx.save();
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate(rotation);
      ctx.scale(stripScale, stripScale);
      ctx.shadowColor = "rgba(78,61,43,0.18)";
      ctx.shadowBlur = 9;
      ctx.shadowOffsetY = 4;
      ctx.fillStyle = strip.dataset.color || "#f7f2e8";
      drawTapeShape(ctx, -width / 2, -height / 2, width, height);
      ctx.shadowColor = "transparent";
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#ffffff";
      for (let i = -height / 2 + 4; i < height / 2; i += 7) ctx.fillRect(-width / 2 + 8, i, width - 16, 0.55);
      ctx.globalAlpha = 1;
      ctx.fillStyle = metrics.color;
      ctx.font = metrics.font;
      ctx.textBaseline = "top";
      ctx.fillText(text, -width / 2 + metrics.textX, -height / 2 + metrics.textY);
      ctx.restore();
    });

    ctx.fillStyle = currentPreset === "black" && !bgImage
      ? "rgba(245,246,242,0.38)"
      : "rgba(57,63,66,0.34)";
    ctx.font = "11px Songti SC, STSong, Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("文本均来源于安溥歌词", rect.width / 2, rect.height - 16);
    exportPreview.src = out.toDataURL("image/png");
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  } catch (error) {
    console.error("导出失败", error);
    alert("生成卡片失败，请刷新页面后再试。");
  }
}

document.querySelector("#exportCard").addEventListener("click", exportCanvas);
document.querySelector("#closeOverlay").addEventListener("click", () => {
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
});

function openInfoOverlay(type) {
  if (type === "songs") {
    infoTitle.textContent = "曲库名称";
    const songs = getSongNames();
    infoBody.innerHTML = `<ul class="song-list">${songs.map((song) => `<li>${escapeHtml(song)}</li>`).join("")}</ul>`;
  } else {
    infoTitle.textContent = "使用说明";
    infoBody.innerHTML = `
      <ol>
        <li>拖拽或双击素材库中的字条，即可将其添加至画布。点击「换一组」可随机刷新字条内容，并支持通过歌曲名称检索字条（详见曲库列表）。</li>
        <li>单击字条后，可通过色轮或色板自由调整纸条颜色；无论在素材库还是画布中均可操作。</li>
        <li>点击素材库中字条右侧的剪刀图标，可进入二次裁剪模式。再次点击字条中的字词，即可将其拆分为独立字条；拆分后的字条将显示在素材库底部。</li>
        <li>画布中的字条支持自由拖拽与排版。<span class="device-lines">PC端：按住 Shift 键并滚动鼠标滚轮可缩放字条，单独滚动滚轮可旋转字条。<br>移动端：支持双指缩放与旋转操作。</span></li>
        <li>支持自主上传背景图片，打造专属拼贴作品。</li>
        <li>作品完成后可点击生成卡片：<span class="device-lines">手机端：长按图片即可保存；<br>PC端：右键图片即可保存。</span></li>
      </ol>
      <h3>特别说明</h3>
      <p>本产品所有字句均摘录自安溥（张悬）公开发表的歌词作品，内容仅供个人娱乐体验，不得用于任何商业用途。</p>
      <p>谢谢安溥，谢谢文字与想象力。</p>
      <p>欢迎来留白。</p>
    `;
  }
  infoOverlay.classList.add("open");
  infoOverlay.setAttribute("aria-hidden", "false");
}

function closeInfo() {
  infoOverlay.classList.remove("open");
  infoOverlay.setAttribute("aria-hidden", "true");
}

document.querySelectorAll(".side-action").forEach((button) => {
  button.textContent = button.textContent.replace(/(.{2})(.{2})/, "$1\n$2");
  button.addEventListener("click", () => openInfoOverlay(button.dataset.info));
});

closeInfoOverlay.addEventListener("click", closeInfo);
infoOverlay.addEventListener("click", (event) => {
  if (event.target === infoOverlay) closeInfo();
});

applyCanvasPreset(currentPreset);
lyricGroups = buildRandomGroups();
renderCurrentGroup();
