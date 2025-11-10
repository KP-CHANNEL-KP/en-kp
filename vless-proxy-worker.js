/**
 * Cloudflare Worker: 
 * 1. Blocks Browser Access.
 * 2. Allows only 'curl' commands.
 * 3. Adds IP Locking (One Device Limit / 1DV) using KV Storage.
 * 4. Uses 'export default' for proper binding access (fixes 'LICENSES' error).
 */

// ----------------------------------------------------------------------
// 🚨 CHANGE THIS: သင့်ရဲ့ မူရင်း GitHub Script URL ကို ဤနေရာတွင် ထည့်သွင်းပါ။
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// ----------------------------------------------------------------------
// 🤖 curl command မှ လာသော request များသာ ခွင့်ပြုရန်
const ALLOWED_USER_AGENTS = ['curl']; 
// 🔑 License Key ကို KV ထဲမှာ ဘယ်လောက်ကြာကြာ သိမ်းထားမလဲ (စက္ကန့် - 1 နာရီ = 3600)
const IP_EXPIRATION_TTL = 3600; 

// Worker Bindings (env) ကို တိုက်ရိုက်ရယူနိုင်ဖို့ 'export default' ပုံစံကို သုံးခြင်း
export default {
    async fetch(request, env) { // env မှာ LICENSES binding ပါဝင်လာပါပြီ
        const userAgent = request.headers.get('User-Agent') || '';

        // ======================================================================
        // 1. User-Agent စစ်ဆေးခြင်း: Browser တွေကို Block လုပ်ပါ။
        // ======================================================================
        const isAllowed = ALLOWED_USER_AGENTS.some(agent => 
            userAgent.toLowerCase().includes(agent.toLowerCase())
        );

        if (!isAllowed) {
            return new Response("ဘားမှမသိချင်နဲ့ညီ အကိုမှလဲ ညီ့ကိုပြစရာ (လီး) ပဲရှိတယ်။😎", { status: 403 });
        }

        // ======================================================================
        // 🔑 1DV (IP Locking) Logic ကို စစ်ဆေးပြီး IP ကို KV ထဲမှာ မှတ်သားပါ
        // ======================================================================
        const clientIP = request.headers.get("cf-connecting-ip");
        let licenseKey = request.url.split('/').pop(); 
        
        // URL နောက်ဆုံးအပိုင်း ဗလာဖြစ်နေရင် 'KP' ကို Default အဖြစ် သတ်မှတ်
        if (licenseKey === '') {
            licenseKey = 'KP'; 
        }
        
        // env.LICENSES ရှိမရှိ၊ IP နှင့် Key ရှိမရှိ စစ်ဆေးခြင်း
        if (clientIP && licenseKey && env.LICENSES) { 
            try {
                // 1. KV ထဲက IP အဟောင်းကို ဖတ်ပါ
                const storedIP = await env.LICENSES.get(licenseKey);

                if (storedIP && storedIP !== clientIP) {
                    // 2. IP ကွာခြားနေရင် Block လုပ်ပါ
                    return new Response("Permission Denied: This license is already in use by another IP. (1DV Active)", { status: 403 });
                }

                // 3. IP အသစ် သို့မဟုတ် IP တူရင် KV ထဲမှာ မှတ်သားပါ
                await env.LICENSES.put(licenseKey, clientIP, { expirationTtl: IP_EXPIRATION_TTL });
                // Log ထဲမှာ မှတ်သားထားခြင်း (Debugging အတွက်)
                console.log(`License: ${licenseKey} locked to IP: ${clientIP}`); 

            } catch (e) {
                // KV Operation မှာ Error တက်ခဲ့ရင် console မှာ ပြသပါ
                console.error(`KV Operation Error for ${licenseKey}: ${e.message}`);
            }
        } 
        
        // ======================================================================
        // 2. 'curl' ဖြစ်ခဲ့ရင် Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
        // ======================================================================
        const fetchOptions = {
            redirect: 'follow',
            cache: 'no-store' 
        };

        try {
            let response = await fetch(TARGET_SCRIPT_URL, fetchOptions);
            
            // Response Headers တွေကို သန့်ရှင်းရေးလုပ်ခြင်း
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
};
