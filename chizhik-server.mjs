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


app.get("/diagnostic", async (req, res) => {
  if (!browserReady || !page) {
    return res.status(503).json({
      ok: false,
      browserReady,
      browserError
    });
  }

  try {
    const result = await page.evaluate(async () => {
      const url =
        "https://app.chizhik.club/delivery/api/catalog/v3/stores/HA4T/search?mode=store&include_restrict=true&q=салфетки%20та&limit=12";

      const response = await fetch(url, {
        credentials: "include"
      });

      const body = await response.text();

      return {
        status: response.status,
        contentType: response.headers.get("content-type"),
        bodyStart: body.slice(0, 500)
      };
    });

    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: String(error)
    });
  }
});


app.get("/browser-plu-diagnostic", async (req, res) => {
  if (!browserReady || !page) {
    return res.status(503).json({
      ok: false,
      browserReady,
      browserError
    });
  }

  try {
    const result = await page.evaluate(async () => {
      const url =
        "https://app.chizhik.club/delivery/api/catalog/v1/stores/HA4T/search-by-ean?ean=4606038083143&mode=store&include_restrict=true";

      try {
        const response = await fetch(url, {
          credentials: "include"
        });

        return {
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          body: (await response.text()).slice(0, 1000),
          pageUrl: location.href
        };
      } catch (error) {
        return {
          ok: false,
          error: String(error),
          pageUrl: location.href
        };
      }
    });

    res.json(result);
  } catch (error) {
    res.status(502).json({
      ok: false,
      error: String(error)
    });
  }
});


app.get("/plu-diagnostic", async (req, res) => {
  try {
    const url =
      "https://app.chizhik.club/delivery/api/catalog/v1/stores/HA4T/search-by-ean?ean=4606038083143&mode=store&include_restrict=true";

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
      },
      signal: AbortSignal.timeout(15000)
    });

    const body = await response.text();

    res.status(200).json({
      test: "server-fetch",
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      body: body.slice(0, 1500)
    });
  } catch (error) {
    res.status(200).json({
      test: "server-fetch",
      error: String(error),
      cause: error.cause
        ? String(error.cause)
        : null
    });
  }
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
const eanUrl =
"https://app.chizhik.club/delivery/api/catalog/v1/stores/HA4T/search-by-ean?ean=" +
encodeURIComponent(ean) +
"&mode=store";

  const eanResponse = await fetch(eanUrl, {
  credentials: "include"
});

  if (!eanResponse.ok) {
    throw new Error("EAN API returned HTTP " + eanResponse.status);
  }

  const eanData = await eanResponse.json();
  const plu = eanData.product?.plu;

  if (!plu) {
    return { found: false, ean };
  }

  const productUrl =
    "https://app.chizhik.club/delivery/api/catalog/v2/stores/HA4T/products/" +
    encodeURIComponent(plu) +
    "?mode=store&include_restrict=true";

  const productResponse = await fetch(productUrl, {
  credentials: "include"
});

  if (!productResponse.ok) {
    throw new Error(
      "Product API returned HTTP " + productResponse.status
    );
  }

  const product = await productResponse.json();

  const brandAttribute = (product.attributes || []).find(
    attribute => attribute.name === "\u0411\u0440\u0435\u043D\u0434"
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

} catch (error) {
console.error("Chizhik lookup failed:", error);
res.status(502).json({ error: String(error) });
}
});

app.listen(PORT, "0.0.0.0", () => {
console.log("Server started on port " + PORT);
startBrowser();
});

async function startBrowser() {
if (browserStarting || browserReady) return;

browserStarting = true;

try {
console.log("Starting Chromium...");
browser = await chromium.launch({ headless: true });
page = await browser.newPage();

console.log("Opening Chizhik catalog...");
await page.goto("https://chizhik.club/catalog/", {
  waitUntil: "domcontentloaded",
  timeout: 45000
});

browserReady = true;
browserError = null;
console.log("Current page URL:", page.url());
console.log("Chizhik browser ready");

} catch (error) {
browserError = String(error);
console.error("Browser startup failed:", browserError);
} finally {
browserStarting = false;
}
}
