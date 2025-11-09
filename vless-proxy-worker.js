/**
 * Cloudflare Worker: Blocks Browser access but allows curl commands.
 */

// ----------------------------------------------------------------------
// 🚨 CHANGE THIS: သင့်ရဲ့ မူရင်း GitHub Script URL ကို ဤနေရာတွင် ထည့်သွင်းပါ။
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// ----------------------------------------------------------------------
// 🤖 curl command မှ လာသော request များသာ ခွင့်ပြုရန်
const ALLOWED_USER_AGENTS = ['curl']; 

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const userAgent = request.headers.get('User-Agent') || '';

  // 1. User-Agent စစ်ဆေးခြင်း: Browser တွေကို Block လုပ်ပါ။
  // User-Agent မှာ 'curl' စာသားပါလား စစ်မယ်။ 
  const isAllowed = ALLOWED_USER_AGENTS.some(agent => 
    userAgent.toLowerCase().includes(agent.toLowerCase())
  );

  // 'curl' မဟုတ်ဘဲ တခြားတစ်ခု (Browser လိုမျိုး) ဆိုရင် 403 Forbidden ပြန်ပေးပါမယ်
  if (!isAllowed) {
    // လူသားတွေကို Browser မှာ မြင်ရမယ့် စာသား
    return new Response("ဘားမှမသိချင်နဲ့ညီ အကို့မှာလဲ ညီ့ကိုပြစရာ ( လီး ) ပဲရှိတယ်။😎", { status: 403 });
  }

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
