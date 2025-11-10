/**
 * Cloudflare Worker: First-Use IP Locking + Custom Browser Block (No Expiration Date).
 * REQUIRES KV BINDING: A KV Namespace (e.g., 'LICENSE_KEYS') must be bound as 'LICENSES'.
 */
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
const CUSTOM_BLOCK_MESSAGE = "ဘားမှမသိချင်နဲ့ညီ အကို့မှာလဲ ညီ့ကိုပြစရာ ( လီး ) ပဲရှိတယ်။😎";

// 🚨 ဤနေရာတွင် LICENSES ကို KV binding မှတစ်ဆင့် ရယူပါသည်။

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const licenseKey = url.searchParams.get('key'); 
  const clientIP = request.headers.get('CF-Connecting-IP'); 
  const userAgent = request.headers.get('User-Agent') || '';
  
  const isCurl = userAgent.toLowerCase().includes('curl');

  // 1. User-Agent စစ်ဆေးခြင်း (Browser များကို Block)
  if (!isCurl) {
    return new Response(CUSTOM_BLOCK_MESSAGE, { status: 403 });
  }

  // 2. 'curl' ဖြစ်ခဲ့ရင် Key နဲ့ IP ကို စစ်ဆေးခြင်း
  if (!licenseKey || !clientIP) {
      return new Response("Access Denied: Please provide a valid key in the URL.", { status: 403 });
  }

  // 3. KV Storage မှ Key အခြေအနေကို ရယူခြင်း
  const storedIP = await LICENSES.get(licenseKey); 

  if (storedIP === null) {
      // 4. Key ကို ပထမဆုံးအကြိမ် အသုံးပြုခြင်း (Locking)
      // TTL မပါဝင်ပါ၊ သို့သော် KV က သူ့ဖာသာ 7 ရက် TTL အနည်းဆုံး ရှိနေနိုင်ပါသည်။
      // သက်တမ်းကို သင့်ရဲ့ Script က ထိန်းချုပ်ပါလိမ့်မည်။
      await LICENSES.put(licenseKey, clientIP); // 🚨 ExpirationTTL ကို ဖြုတ်လိုက်သည်။
      
  } else if (storedIP !== clientIP) {
      // 5. IP မတူပါက Block
      return new Response("Access Denied: This key is already locked to another device/IP.", { status: 403 });
  }
  
  // 6. IP စစ်ဆေးမှု အောင်မြင်ပါက Script Content ကို ပြန်ပေးခြင်း
  try {
    let response = await fetch(TARGET_SCRIPT_URL, { redirect: 'follow', cache: 'no-store' });
    
    const headers = new Headers(response.headers);
    headers.delete('server'); 
    
    return new Response(response.body, { status: response.status, headers: headers });
    
  } catch (error) {
      return new Response(`Error fetching script: ${error.message}`, { status: 500 });
  }
}
