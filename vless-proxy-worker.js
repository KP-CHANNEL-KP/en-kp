/**
 * Cloudflare Worker: 
 * 1. Blocks Browser Access (Only 'curl' allowed).
 * 2. Key Validation (Only predefined Keys in KV can be used).
 * 3. IP Locking (One Device Limit / 1DV) using KV Storage.
 */

// ----------------------------------------------------------------------
// 🚨 CHANGE THIS: သင့်ရဲ့ မူရင်း GitHub Script URL ကို ဤနေရာတွင် ထည့်သွင်းပါ။
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// ----------------------------------------------------------------------
// 🤖 curl command မှ လာသော request များသာ ခွင့်ပြုရန်
const ALLOWED_USER_AGENTS = ['curl']; 
// 🔑 License Key ကို KV ထဲမှာ ဘယ်လောက်ကြာကြာ IP နဲ့ သိမ်းထားမလဲ (စက္ကန့် - 1 နာရီ = 3600)
const IP_EXPIRATION_TTL = 31536000; 
// KV Binding နာမည် (သင့် Dashboard မှာ LICENSES လို့ ချိတ်ထားရင် ဒီအတိုင်းထားပါ)
const LICENSE_NAMESPACE = 'LICENSES'; 

// Worker Bindings (env) ကို တိုက်ရိုက်ရယူနိုင်ဖို့ 'export default' ပုံစံကို သုံးခြင်း
export default {
    async fetch(request, env) { 
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
        // 🔑 Key Validation & IP Locking (1DV) Logic
        // ======================================================================
        const clientIP = request.headers.get("cf-connecting-ip");
        let licenseKey = request.url.split('/').pop(); 
        
        // URL နောက်ဆုံးအပိုင်း ဗလာဖြစ်နေရင် 'KP' ကို Default အဖြစ် သတ်မှတ်
        if (licenseKey === '') {
            licenseKey = 'KP'; 
        }
        
        // KV Binding နှင့် IP/Key ရှိမရှိ စစ်ဆေးခြင်း
        if (clientIP && licenseKey && env[LICENSE_NAMESPACE]) { 
            try {
                // KV ထဲက Key ရဲ့ Status/IP ကို ဖတ်ပါ
                const keyStatus = await env[LICENSE_NAMESPACE].get(licenseKey); 
                
                // 1. Key Validation: KV ထဲမှာ ဒီ Key မရှိရင် Block ပါ
                if (keyStatus === null) { 
                    console.warn(`Attempted to use invalid license key: ${licenseKey}`);
                    return new Response("Invalid License Key. Please contact the administrator.", { status: 403 });
                }

                // 2. IP Locking (1DV) စစ်ဆေးခြင်း
                // keyStatus !== 'active' (ပထမဆုံးအကြိမ်သုံးမဟုတ်) ဖြစ်ပြီး၊
                // လက်ရှိ IP နဲ့လည်း မတူရင် Block ပါ။
                if (keyStatus !== 'active' && keyStatus !== clientIP) { 
                    console.warn(`Access Denied for Key: ${licenseKey}. Used by ${keyStatus}, current IP: ${clientIP}`);
                    return new Response("Permission Denied: This license is already in use by another IP. (1DV Active)", { status: 403 });
                }

                // 3. IP အသစ် သို့မဟုတ် IP တူရင် KV ထဲမှာ IP ကို မှတ်သားပါ
                // 'active' ဆိုတဲ့ စာသားကို လက်ရှိ IP နဲ့ အစားထိုးသွားပါမယ်။
                await env[LICENSE_NAMESPACE].put(licenseKey, clientIP, { expirationTtl: IP_EXPIRATION_TTL });
                console.log(`License: ${licenseKey} locked to IP: ${clientIP}`); 

            } catch (e) {
                // KV Operation မှာ Error တက်ခဲ့ရင်
                console.error(`KV Operation Error for ${licenseKey}: ${e.message}`);
                return new Response("An internal error occurred during key verification.", { status: 500 });
            }
        } else {
            // Binding သို့မဟုတ် IP/Key မရှိခဲ့ရင် Block ပါ
            return new Response("Configuration Error. Missing KV setup or Client IP.", { status: 500 });
        }
        
        // ======================================================================
        // 4. Key မှန်ပြီး IP Lock အဆင်ပြေရင် Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
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
