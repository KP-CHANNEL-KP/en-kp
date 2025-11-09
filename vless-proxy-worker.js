/**
 * Cloudflare Worker: Secure Proxy for VLESS Setup Script.
 * * This worker fetches the content from a private/raw URL 
 * and returns it directly to the client (curl) without performing 
 * an HTTP redirect, thus concealing the TARGET_SCRIPT_URL.
 */

// ----------------------------------------------------------------------
// 🚨 CHANGE THIS: သင့်ရဲ့ မူရင်း GitHub Script URL ကို ဤနေရာတွင် ထည့်သွင်းပါ။
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// ----------------------------------------------------------------------

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  
  // Fetch options:
  // 'follow' ensures the Worker follows any 301/302 redirects 
  // that might be issued by raw.githubusercontent.com itself.
  // 'no-store' helps prevent caching issues.
  const fetchOptions = {
    redirect: 'follow',
    cache: 'no-store' 
  };

  try {
    // 1. မူရင်း GitHub URL ကို Worker ရဲ့ နောက်ကွယ်မှာ (Backend) တောင်းဆိုခြင်း
    let response = await fetch(TARGET_SCRIPT_URL, fetchOptions);

    // 2. Response ၏ Headers များကို ကူးယူပြီး Response အသစ်တစ်ခု ပြန်လည်တည်ဆောက်ခြင်း
    // ၎င်းသည် GitHub မှ ပါလာသော sensitive headers များကို ဖယ်ရှားရန်နှင့်
    // Worker ၏ URL ကို ပြင်ပသို့ မပေးပို့မိစေရန်ဖြစ်သည်။
    
    // Response headers များကို ကူးယူခြင်း (မူရင်း Content-Type များပါလာစေရန်)
    const headers = new Headers(response.headers);
    
    // GitHub ကနေ လာတဲ့ URL ကို ဖော်ပြနိုင်တဲ့ headers တွေ (ဥပမာ- X-GitHub-Request-Id) ကို ဖယ်ရှားခြင်း
    headers.delete('x-served-by');
    headers.delete('server');
    headers.delete('x-cache');
    headers.delete('x-request-id');
    
    // Response ကို Content-Body အဖြစ် တိုက်ရိုက်ပြန်ပို့ခြင်း (Redirect မလုပ်ပါ)
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });

  } catch (error) {
    // Fetch လုပ်ရာတွင် ပြဿနာတက်ပါက Error message ပြန်ပေးခြင်း
    return new Response(`Error fetching script: ${error.message}`, { status: 500 });
  }
}
