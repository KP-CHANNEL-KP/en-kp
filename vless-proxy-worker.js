/**
 * Cloudflare Worker: Blocks Browser access but allows curl commands + Adds IP Locking (1DV).
 */

// ----------------------------------------------------------------------
// 🚨 CHANGE THIS: သင့်ရဲ့ မူရင်း GitHub Script URL ကို ဤနေရာတွင် ထည့်သွင်းပါ။
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// ----------------------------------------------------------------------
// 🤖 curl command မှ လာသော request များသာ ခွင့်ပြုရန်
const ALLOWED_USER_AGENTS = ['curl']; 

// addEventListener မှာ event.env ကို လက်ခံနိုင်ဖို့ ပြင်ဆင်ခြင်း
addEventListener('fetch', event => {
  // event.request နဲ့ event.env ကို handleRequest ထဲကို ပို့ပေးပါမယ်
  event.respondWith(handleRequest(event.request, event.env)); 
});

// env (Bindings) ကို ဒုတိယ parameter အနေနဲ့ လက်ခံရယူပါ
async function handleRequest(request, env) { 
  const userAgent = request.headers.get('User-Agent') || '';

  // 1. User-Agent စစ်ဆေးခြင်း: Browser တွေကို Block လုပ်ပါ။
  const isAllowed = ALLOWED_USER_AGENTS.some(agent => 
    userAgent.toLowerCase().includes(agent.toLowerCase())
  );

  // 'curl' မဟုတ်ရင် 403 Forbidden ပြန်ပေးပါမယ်
  if (!isAllowed) {
    return new Response("ဘားမှမသိချင်နဲ့ညီ အကိုမှလဲ ညီ့ကိုပြစရာ (လီး) ပဲရှိတယ်။😎", { status: 403 });
  }

  // ======================================================================
  // 🔑 1DV (IP Locking) Logic ကို ဤနေရာတွင် ထည့်သွင်းရပါမည်
  // ======================================================================

  const clientIP = request.headers.get("cf-connecting-ip");
  // curl command ရဲ့ နောက်ဆုံးအပိုင်း (e.g., /KP) ကို License Key အဖြစ်ယူပါ။
  const licenseKey = request.url.split('/').pop(); 

  // env.LICENSES ရှိမရှိ၊ IP ရမရ၊ Key ရမရ စစ်ဆေးခြင်း
  if (clientIP && licenseKey && env.LICENSES) {
      // 1. KV ထဲက IP အဟောင်းကို ဖတ်ပါ
      const storedIP = await env.LICENSES.get(licenseKey);

      if (storedIP && storedIP !== clientIP) {
          // 2. IP ကွာခြားနေပြီး အရင်က သုံးထားသူရှိရင် Block လုပ်ပါ။
          return new Response("Permission Denied: This license is already in use by another IP.", { status: 403 });
      }

      // 3. IP အသစ် သို့မဟုတ် IP တူရင် KV ထဲမှာ မှတ်သားပါ။
      // 1DV အတွက် IP ကို 1 နာရီ (3600 စက္ကန့်) သက်တမ်းဖြင့် သိမ်းထားခြင်း
      await env.LICENSES.put(licenseKey, clientIP, { expirationTtl: 3600 });
      // Log ထဲမှာ မှတ်သားထားခြင်း (Debugging အတွက်)
      console.log(`License: ${licenseKey} locked to IP: ${clientIP}`); 
  } 

  // ======================================================================

  // 2. 'curl' ဖြစ်ခဲ့ရင် Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
  const fetchOptions = {
    redirect: 'follow',
    cache: 'no-store' 
  };

  try {
    let response = await fetch(TARGET_SCRIPT_URL, fetchOptions);
    
    // Response Headers တွေကို သန့်ရှင်းရေးလုပ်ခြင်း (Optional)
    const headers = new Headers(response.headers);
    headers.delete('x-served-by');
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: headers
    });
    
  } catch (error) {
    return new Response(`Error fetching script: ${error.message}`, { status: 500 });
  }
}
