/* =========================================================
   自由城市 · 城建沙盒
   纯原生 JS + Canvas 实现,零依赖。
   核心思路:用一个二维数组存地图,每次改动重新计算资源并渲染。
   ========================================================= */

// ===== 建筑定义 =====
// cost 造价 | income 每日收益 | pop 提供人口 | happy 对幸福度的影响
const BUILDINGS = [
  { id: "road",     name: "道路",   emoji: "🛣️", cost: 10,   income: 0,  pop: 0,  happy: 0,  color: "#5b6472" },
  { id: "house",    name: "住宅",   emoji: "🏠", cost: 100,  income: 0,  pop: 4,  happy: 0,  color: "#e0a458" },
  { id: "apartment",name: "公寓楼", emoji: "🏢", cost: 300,  income: 0,  pop: 14, happy: -1, color: "#7f9cc0" },
  { id: "shop",     name: "商店",   emoji: "🏪", cost: 150,  income: 8,  pop: 0,  happy: 1,  color: "#e06c9f" },
  { id: "factory",  name: "工厂",   emoji: "🏭", cost: 250,  income: 22, pop: 0,  happy: -7, color: "#8a8f99" },
  { id: "park",     name: "公园",   emoji: "🌳", cost: 80,   income: 0,  pop: 0,  happy: 5,  color: "#5cb85c" },
  { id: "hospital", name: "医院",   emoji: "🏥", cost: 400,  income: 0,  pop: 0,  happy: 3,  color: "#e85d5d" },
  { id: "school",   name: "学校",   emoji: "🏫", cost: 350,  income: 0,  pop: 0,  happy: 2,  color: "#c084fc" },
  { id: "tower",    name: "电视塔", emoji: "🗼", cost: 1000, income: 6,  pop: 0,  happy: 10, color: "#ffd93d" },
];

// 用 id 快速查建筑
function getBuilding(id) {
  return BUILDINGS.find(function (b) { return b.id === id; });
}

// ===== 地图配置 =====
const COLS = 20;
const ROWS = 15;
const TILE = 40;

const canvas = document.getElementById("city");
const ctx = canvas.getContext("2d");

// ===== 游戏状态 =====
let grid = [];          // 二维数组,每格存建筑 id 或 null
let money = 2000;
let population = 0;
let happiness = 60;     // 基础幸福度
let day = 1;
let selected = null;    // 当前选中的建筑 id
let bulldoze = false;   // 是否处于拆除模式
let paused = false;
let hover = { col: -1, row: -1 }; // 鼠标悬停的格子

const SAVE_KEY = "city-builder-save-v1";

// ===== 初始化空地图 =====
function initGrid() {
  grid = [];
  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) {
      row.push(null);
    }
    grid.push(row);
  }
}

// ===== 重新计算人口与幸福度(遍历全图) =====
function recomputeStats() {
  let pop = 0;
  let happy = 60; // 基础值
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = grid[r][c];
      if (!id) continue;
      const b = getBuilding(id);
      pop += b.pop;
      happy += b.happy;
    }
  }
  population = pop;
  happiness = Math.max(0, Math.min(100, happy));
}

// ===== 每日收益 =====
function dailyIncome() {
  let base = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = grid[r][c];
      if (id) base += getBuilding(id).income;
    }
  }
  // 人口税收 + 幸福度加成(幸福度越高,收益越高)
  const tax = population * 2;
  const multiplier = 0.5 + happiness / 100;
  return Math.round((base + tax) * multiplier);
}

// ===== 推进一天 =====
function tick() {
  if (paused) return;
  money += dailyIncome();
  day += 1;
  updateHUD();
  renderPaletteAffordability();
}

// ===== 放置建筑 =====
function placeBuilding(col, row) {
  if (!selected) return;
  if (grid[row][col]) return; // 已有建筑
  const b = getBuilding(selected);
  if (money < b.cost) {
    flashHint("💰 金钱不足,无法建造" + b.name);
    return;
  }
  money -= b.cost;
  grid[row][col] = selected;
  recomputeStats();
  updateHUD();
  renderPaletteAffordability();
}

// ===== 拆除建筑(返还 50%) =====
function demolish(col, row) {
  const id = grid[row][col];
  if (!id) return;
  const b = getBuilding(id);
  money += Math.floor(b.cost * 0.5);
  grid[row][col] = null;
  recomputeStats();
  updateHUD();
  renderPaletteAffordability();
}

// ===== 绘制一帧 =====
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 草地(棋盘格)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? "#3a7d44" : "#357a3f";
      ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }

  // 建筑
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const id = grid[r][c];
      if (!id) continue;
      drawBuilding(c, r, getBuilding(id), 1);
    }
  }

  // 悬停预览(半透明幽灵 + 合法性描边)
  if (hover.col >= 0 && hover.row >= 0) {
    const occupied = !!grid[hover.row][hover.col];
    if (bulldoze) {
      if (occupied) highlightCell(hover.col, hover.row, "#ff6b6b");
    } else if (selected && !occupied) {
      const b = getBuilding(selected);
      const ok = money >= b.cost;
      drawBuilding(hover.col, hover.row, b, 0.5);
      highlightCell(hover.col, hover.row, ok ? "#7CFC9B" : "#ff6b6b");
    }
  }
}

// 画一个建筑(带透明度)
function drawBuilding(col, row, b, alpha) {
  const x = col * TILE;
  const y = row * TILE;
  ctx.globalAlpha = alpha;

  // 底座色块(圆角)
  ctx.fillStyle = b.color;
  roundRect(x + 3, y + 3, TILE - 6, TILE - 6, 6);
  ctx.fill();

  // 图标 emoji
  ctx.font = "22px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.emoji, x + TILE / 2, y + TILE / 2 + 1);

  ctx.globalAlpha = 1;
}

// 高亮某格边框
function highlightCell(col, row, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2);
}

// 圆角矩形路径
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ===== 渲染循环 =====
function loop() {
  draw();
  requestAnimationFrame(loop);
}

// ===== 更新顶部资源显示 =====
function updateHUD() {
  document.getElementById("money").textContent = money;
  document.getElementById("population").textContent = population;
  document.getElementById("happiness").textContent = happiness;
  document.getElementById("day").textContent = day;
}

// ===== 生成左侧建筑面板 =====
function buildPalette() {
  const palette = document.getElementById("palette");
  palette.innerHTML = "";
  BUILDINGS.forEach(function (b, i) {
    const btn = document.createElement("button");
    btn.className = "build-item";
    btn.dataset.id = b.id;
    btn.innerHTML =
      '<span class="emoji">' + b.emoji + "</span>" +
      '<span class="name">' + (i + 1) + ". " + b.name + "</span>" +
      '<span class="cost">💰' + b.cost + "</span>";
    btn.addEventListener("click", function () { selectBuilding(b.id); });
    palette.appendChild(btn);
  });
}

// 选中某个建筑
function selectBuilding(id) {
  selected = id;
  bulldoze = false;
  document.getElementById("bulldoze-btn").classList.remove("active");
  document.querySelectorAll(".build-item").forEach(function (el) {
    el.classList.toggle("selected", el.dataset.id === id);
  });
  showBuildingInfo(getBuilding(id));
}

// 切换拆除模式
function toggleBulldoze() {
  bulldoze = !bulldoze;
  if (bulldoze) {
    selected = null;
    document.querySelectorAll(".build-item").forEach(function (el) {
      el.classList.remove("selected");
    });
  }
  document.getElementById("bulldoze-btn").classList.toggle("active", bulldoze);
  document.getElementById("info").textContent = bulldoze
    ? "🧨 拆除模式:点击建筑即可拆除,返还 50% 造价。"
    : "在左侧选择一种建筑,点击地图即可建造。";
}

// 底部信息栏显示建筑详情
function showBuildingInfo(b) {
  let effect = [];
  if (b.income) effect.push("💰+" + b.income + "/天");
  if (b.pop) effect.push("👥+" + b.pop);
  if (b.happy > 0) effect.push("😊+" + b.happy);
  if (b.happy < 0) effect.push("😊" + b.happy);
  if (effect.length === 0) effect.push("无特殊效果");
  document.getElementById("info").innerHTML =
    "<b>" + b.emoji + " " + b.name + "</b><br>造价 💰" + b.cost + "<br>" +
    effect.join(" · ");
}

// 根据金钱灰掉买不起的建筑
function renderPaletteAffordability() {
  document.querySelectorAll(".build-item").forEach(function (el) {
    const b = getBuilding(el.dataset.id);
    el.classList.toggle("cant-afford", money < b.cost);
  });
}

// 提示条闪烁文字
let hintTimer = null;
const defaultHint = "左键建造 · 右键拆除 · 数字键 1-9 快速选择 · 空格 暂停/继续";
function flashHint(text) {
  const el = document.getElementById("hint");
  el.textContent = text;
  el.style.color = "#ff9b9b";
  clearTimeout(hintTimer);
  hintTimer = setTimeout(function () {
    el.textContent = defaultHint;
    el.style.color = "";
  }, 1800);
}

// ===== 鼠标坐标 → 格子(处理画布缩放) =====
function eventToCell(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  return {
    col: Math.floor(x / TILE),
    row: Math.floor(y / TILE),
  };
}

function inBounds(cell) {
  return cell.col >= 0 && cell.col < COLS && cell.row >= 0 && cell.row < ROWS;
}

// ===== 事件绑定 =====
canvas.addEventListener("mousemove", function (e) {
  const cell = eventToCell(e);
  hover = inBounds(cell) ? cell : { col: -1, row: -1 };
});

canvas.addEventListener("mouseleave", function () {
  hover = { col: -1, row: -1 };
});

canvas.addEventListener("click", function (e) {
  const cell = eventToCell(e);
  if (!inBounds(cell)) return;
  if (bulldoze) demolish(cell.col, cell.row);
  else placeBuilding(cell.col, cell.row);
});

canvas.addEventListener("contextmenu", function (e) {
  e.preventDefault(); // 屏蔽浏览器右键菜单
  const cell = eventToCell(e);
  if (inBounds(cell)) demolish(cell.col, cell.row);
});

document.getElementById("bulldoze-btn").addEventListener("click", toggleBulldoze);
document.getElementById("save-btn").addEventListener("click", saveGame);
document.getElementById("load-btn").addEventListener("click", loadGame);
document.getElementById("reset-btn").addEventListener("click", resetGame);

// 键盘快捷键
document.addEventListener("keydown", function (e) {
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= BUILDINGS.length) {
    selectBuilding(BUILDINGS[n - 1].id);
  } else if (e.key.toLowerCase() === "x") {
    toggleBulldoze();
  } else if (e.key === "Escape") {
    selected = null;
    bulldoze = false;
    document.querySelectorAll(".build-item").forEach(function (el) { el.classList.remove("selected"); });
    document.getElementById("bulldoze-btn").classList.remove("active");
  } else if (e.key === " ") {
    e.preventDefault();
    paused = !paused;
    flashHint(paused ? "⏸️ 已暂停" : "▶️ 继续经营");
  }
});

// ===== 存档 / 读档 =====
function saveGame() {
  const data = { grid: grid, money: money, day: day };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  flashHint("💾 城市已保存");
}

function loadGame() {
  const raw = localStorage.getItem(SAVE_KEY);
  if (!raw) {
    flashHint("📂 没有存档");
    return;
  }
  try {
    const data = JSON.parse(raw);
    grid = data.grid;
    money = data.money;
    day = data.day;
    recomputeStats();
    updateHUD();
    renderPaletteAffordability();
    flashHint("📂 已读取存档");
  } catch (err) {
    flashHint("❌ 存档损坏");
  }
}

function resetGame() {
  if (!confirm("确定要重置城市吗?当前建造的一切都会清空。")) return;
  initGrid();
  money = 2000;
  day = 1;
  recomputeStats();
  updateHUD();
  renderPaletteAffordability();
  flashHint("♻️ 城市已重置");
}

// ===== 启动 =====
function start() {
  initGrid();
  buildPalette();
  recomputeStats();
  updateHUD();
  renderPaletteAffordability();
  setInterval(tick, 2000); // 每 2 秒 = 游戏内 1 天
  requestAnimationFrame(loop);
}

start();
