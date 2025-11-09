// 🚧 ဒီနေရာမှာ သင့်ရဲ့ မူရင်း GitHub Script URL ကို ထည့်သွင်းပါ
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 1. မူရင်း GitHub URL ကို တောင်းဆိုခြင်း
  const response = await fetch(TARGET_SCRIPT_URL);
  
  // 2. HTTP Status code (200, 404 စသည်ဖြင့်) နှင့် Content Type များကို ထိန်းသိမ်းထားခြင်း
  
  // 3. GitHub မှ ရရှိသော Content ကို Redirect လုပ်ခြင်းမရှိဘဲ (No Redirect)
  // တိုက်ရိုက် Client (curl) သို့ ပြန်ပို့ပေးခြင်း
  return response;
}
