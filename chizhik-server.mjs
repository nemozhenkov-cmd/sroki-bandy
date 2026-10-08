import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

let browser = null;
let page = null;
let browserReady = false;
let browserError = null;
let browserStarting = false;

app.get("/health", (req, res) => {
res.json({
ok: true,
browserReady,
browserError
});
});

app.get("/chizhik/:ean", async (req, res) => {
if (!browserReady || !page) {
return res.status(503).json({
error: "Chizhik browser is not ready yet",
details: browserError
});
}

try {
const result = await page.evaluate(async (ean) => {
const eanResponse = await fetch(
`https://app.chizhik.club/delivery/api/catalog/v1/stores/HA4T/search-by-ean?ean=${encodeURIComponent(ean)}&mode=store`
);

```
  if (!eanResponse.ok) {
    throw new Error(`EAN API returned HTTP ${eanResponse.status}`);
  }

  const eanData = await eanResponse.json();
  const plu = eanData.product?.plu;

  if (!plu) {
    return { found: false, ean };
  }

  const productResponse = await fetch(
    `https://app.chizhik.club/delivery/api/catalog/v2/stores/HA4T/products/${plu}?mode=store&include_restrict=true`
  );

  if (!productResponse.ok) {
    throw new Error(`Product API returned HTTP ${productResponse.status}`);
  }

  const product = await productResponse.json();
  const brandAttribute = (product.attributes || []).find(
    attribute => attribute.name === "Бренд"
  );

  return {
    found: true,
    ean,
    plu,
    name: product.name,
    brand: brandAttribute?.value || null,
    image: product.image_links?.small?.[0] || null,
    price: product.prices?.[0]?.value || null
  };
}, req.params.ean);

res.json(result);
```

} catch (error) {
console.error("Chizhik lookup failed:", error);
res.status(502).json({ error: String(error) });
}
});

app.listen(PORT, "0.0.0.0", () => {
console.log(`Server started on port ${PORT}`);
startBrowser();
});

async function startBrowser() {
if (browserStarting || browserReady) return;
browserStarting = true;

try {
console.log("Starting Chromium...");
browser = await chromium.launch({ headless: true });
page = await browser.newPage();

```
console.log("Opening Chizhik catalog...");
await page.goto("https://chizhik.club/catalog/", {
  waitUntil: "domcontentloaded",
  timeout: 45000
});

browserReady = true;
browserError = null;
console.log("Chizhik browser ready");
```

} catch (error) {
browserError = String(error);
console.error("Browser startup failed:", browserError);
} finally {
browserStarting = false;
}
}
