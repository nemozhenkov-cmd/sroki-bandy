import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    })
  }

  try {
    const { ean } = await req.json()

    if (!ean) {
      return new Response(
        JSON.stringify({ error: "EAN is required" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      )
    }

    const url =
      `https://app.chizhik.club/delivery/api/catalog/v1/stores/HA4T/search-by-ean?ean=${encodeURIComponent(ean)}&mode=store`

    const response = await fetch(url, {
      method: "GET",
     headers: {
  "Accept": "application/json",
  "User-Agent": "Mozilla/5.0",
  "X-Device-Id": "75ff0432-0760-425c-8322-c749b4bdbfc4",
  "X-App-Version": "1.0.0",
  "X-PLATFORM": "web",
  "X-Tenant-Id": "chizhik",
  "X-Capabilities": "web",
  "X-Catalog-Include-Weight-In-Name": "true"
}
    })

    const text = await response.text()

    return new Response(
      JSON.stringify({
        chizhik_status: response.status,
        chizhik_content_type: response.headers.get("content-type"),
        chizhik_body: text
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    )
  }
})