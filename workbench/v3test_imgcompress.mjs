// 图片压缩回归测试：验证 sport_todos / sport_recycle_bin 中的超大 base64 图片
// 在写入时会被压缩（最长边<=1280px、JPEG q0.72），从而不再撑爆 Supabase 免费空间。
import { JSDOM } from "jsdom";
import { readFileSync } from "fs";

const html = readFileSync(new URL("./dist/index.html", import.meta.url), "utf-8");
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;

// 让 jsdom 支持压缩路径：canvas 返回可用上下文 + 极小的 toDataURL
window.HTMLCanvasElement.prototype.getContext = function () {
  return new Proxy({}, { get: () => () => {} });
};
window.HTMLCanvasElement.prototype.toDataURL = function () {
  return "data:image/jpeg;base64,SMALLCOMPRESSED";
};
// 让 Image 能触发 onload，并给出合理尺寸（2000x1500 -> 会被缩到 1280px）
window.Image = class {
  set src(v) {
    this._src = v;
    setTimeout(() => {
      this.width = 2000; this.height = 1500;
      this.naturalWidth = 2000; this.naturalHeight = 1500;
      if (this.onload) this.onload();
    }, 0);
  }
};

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("  [OK] " + name); }
  else { fail++; console.log("  [FAIL] " + name); }
}

window.addEventListener("load", () => setTimeout(run, 400));

function run() {
  const big = "data:image/png;base64," + "A".repeat(400000); // 约 300KB 原图

  // 1) sport_todos：写入超大全图后应被压缩变小，且数据不丢失
  window.setStorage("sport_todos", [{ id: "t1", text: "带图待办", type: "daily", images: [big] }]);

  setTimeout(() => {
    const stored = JSON.parse(window.localStorage.getItem("sport_todos") || "[]");
    check("sport_todos 写入后仍有 1 条（数据不丢）", stored.length === 1);
    check("sport_todos 图片仍存在（功能保留）", stored[0] && stored[0].images && stored[0].images.length === 1);
    check("sport_todos 超大图片被压缩变小", stored[0] && stored[0].images[0].length < big.length);

    // 2) sport_recycle_bin：同样路径
    window.setStorage("sport_recycle_bin", [{ id: "r1", text: "已删待办", images: [big] }]);
    setTimeout(() => {
      const rec = JSON.parse(window.localStorage.getItem("sport_recycle_bin") || "[]");
      check("回收站图片也被压缩变小", rec[0] && rec[0].images[0].length < big.length);

      // 3) 小图（<250KB）不应被压缩（无损、省算力）
      const small = "data:image/png;base64," + "B".repeat(5000);
      window.setStorage("sport_todos", [{ id: "t2", text: "小图", type: "daily", images: [small] }]);
      setTimeout(() => {
        const s2 = JSON.parse(window.localStorage.getItem("sport_todos") || "[]");
        const t2 = s2.find((x) => x.id === "t2");
        check("小图(<250KB)原样保留不压缩", t2 && t2.images[0] === small);

        console.log("\n===== 图片压缩回归测试: " + pass + " 通过 / " + fail + " 失败 =====");
        process.exit(fail ? 1 : 0);
      }, 300);
    }, 300);
  }, 300);
}
