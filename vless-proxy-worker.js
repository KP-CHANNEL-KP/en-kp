/**
 * Cloudflare Worker: 
 * Features: Browser Block, Key Validation (1DV/MULTI/MASTER), IP Locking (1DV), Expiration Check (MMT).
 * New Feature: Auto 1DV Key Creation (Key must exist in user_expiry_list.txt first).
 */

// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
// 🚨 CHANGE THIS: သက်တမ်းစာရင်းပါသော TXT ဖိုင် URL
const EXPIRY_LIST_URL = "https://raw.githubusercontent.com/YOUR_GITHUB_USER/YOUR_REPO/main/user_expiry_list.txt"; 
// ----------------------------------------------------------------------
const ALLOWED_USER_AGENTS = ['curl']; 
const IP_EXPIRATION_TTL = 31536000; // 1 နှစ်စာ (စက္ကန့်)
const LICENSE_NAMESPACE = 'LICENSES'; 

export default {
    async fetch(request, env) { 
        const userAgent = request.headers.get('User-Agent') || '';
        if (!ALLOWED_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent.toLowerCase()))) {
            return new Response("ဘားမှမသိချင်နဲ့ညီ အကိုမှလဲ ညီ့ကိုပြစရာ (လီး) ပဲရှိတယ်။😎", { status: 403 });
        }

        const clientIP = request.headers.get("cf-connecting-ip");
        let licenseKey = request.url.split('/').pop(); 
        if (licenseKey === '') { licenseKey = 'KP'; }
        
        let keyData; 
        let expiryDateStr; // Expiry Date ကို KV check မလုပ်ခင် ရယူထားပါမယ်။

        // ======================================================================
        // 1. Expiration Date စစ်ဆေးခြင်း (Auto Creation အတွက် ကြိုတင် စစ်ဆေးရန်)
        // ======================================================================
        try {
            const expiryResponse = await fetch(EXPIRY_LIST_URL);
            if (!expiryResponse.ok) {
                console.error("Failed to fetch expiry list. Allowing access to prevent service outage.");
            } else {
                const expiryText = await expiryResponse.text();
                const expiryMap = new Map();
                
                expiryText.split('\n').forEach(line => {
                    const [key, dateStr] = line.trim().split('=');
                    if (key && dateStr) {
                        expiryMap.set(key.trim(), dateStr.trim());
                    }
                });

                expiryDateStr = expiryMap.get(licenseKey);

                // Expiry List ထဲမှာ Key မရှိရင် Invalid Key ဖြစ်သည်။
                if (!expiryDateStr) {
                    return new Response("Invalid License Key (Not found in Expiry List).", { status: 403 });
                }
            }
        } catch (error) {
            console.error(`Expiry List Fetch Error: ${error.message}`);
        }

        // ======================================================================
        // 🔑 2. Key Validation, Type Check, & Auto Creation Logic
        // ======================================================================
        try {
            const keyJson = await env[LICENSE_NAMESPACE].get(licenseKey); 
            
            // 2.1. Key သည် KV ထဲတွင် မရှိသေးပါက (Auto Create လုပ်မည်)
            if (keyJson === null) { 
                
                // 🛑 AUTO CREATION LOGIC
                // Expiry List ထဲမှာတော့ ရှိပြီးသားဖြစ်ရမည်။
                keyData = { type: "1DV", ip: "active" };
                
                // KV ထဲမှာ 1DV Key အဖြစ် ဖန်တီးလိုက်ပါ
                await env[LICENSE_NAMESPACE].put(licenseKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
                
                console.log(`Auto-created 1DV Key: ${licenseKey}`);
                
            } else {
                // 2.2. Key ရှိပြီးသားဆိုရင် JSON ကို Parse လုပ်မည်
                keyData = JSON.parse(keyJson);
            }

            // 3. MASTER Key Check: MASTER Key ဆိုရင် ကျန် Logic တွေအားလုံးကို ကျော်ပြီး Script ကို တန်းပို့မည်။
            if (keyData.type === 'MASTER') {
                console.log(`MASTER Key ${licenseKey} Access Granted.`);
                return fetchScript(TARGET_SCRIPT_URL);
            }

        } catch (e) {
            console.error(`Key Parsing/Validation Error: ${e.message}`);
            return new Response("An internal error occurred during key parsing or verification.", { status: 500 });
        }
        
        // ======================================================================
        // 🔐 3. IP Locking / 1DV Check
        // ======================================================================
        if (keyData.type === '1DV' && clientIP) { 
            const currentIP = keyData.ip;
            
            // 1DV Check: IP Lock ထားတာနဲ့ မတူရင် Block ပါ
            if (currentIP && currentIP !== 'active' && currentIP !== clientIP) { 
                return new Response("Permission Denied: This license (1DV) is already in use by another IP.", { status: 403 });
            }

            // IP မှတ်သားခြင်း/Update လုပ်ခြင်း
            // Key Data ကို Update လုပ်ပြီး TTL ထည့်သွင်းမည်။
            if (currentIP !== clientIP) {
                keyData.ip = clientIP;
                await env[LICENSE_NAMESPACE].put(licenseKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
            }
            
        } else if (keyData.type === '1DV' && !clientIP) {
            // 1DV Key ဖြစ်ပြီး IP မရရင် Error ပေး
            return new Response("Configuration Error: Client IP not received.", { status: 500 });
        }
        
        // ======================================================================
        // 🗓️ 4. Expiration Date Check Logic (Expiry Date ကို အပေါ်မှာ ယူထားပြီးသားဖြစ်သည်)
        // ======================================================================
        if (expiryDateStr) {
            // MMT Timezone Fix Logic
            const expiryDate = new Date(expiryDateStr);
            // MMT (UTC+6:30) ည 11:59:59 အဖြစ် သတ်မှတ်
            expiryDate.setHours(23 + 6, 30, 0, 0); 

            const currentDate = new Date();
            // လက်ရှိအချိန်ကို MMT သို့ ပြောင်းလဲ
            currentDate.setHours(currentDate.getUTCHours() + 6, currentDate.getUTCMinutes() + 30, 0, 0); 

            // MMT End of Day Logic (Compare)
            if (currentDate.getTime() > expiryDate.getTime()) {
                console.warn(`License Key ${licenseKey} expired on ${expiryDateStr} (MMT).`);
                return new Response(`License Expired on ${expiryDateStr} (MMT). Please renew.`, { status: 403 });
            }
        }

        // ======================================================================
        // 5. Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
        // ======================================================================
        return fetchScript(TARGET_SCRIPT_URL);
    }
};

/**
 * Script ကို fetch လုပ်ပြီး response ပြန်ပို့သော Function
 */
async function fetchScript(url) {
    const fetchOptions = {
        redirect: 'follow',
        cache: 'no-store' 
    };

    try {
        let response = await fetch(url, fetchOptions);
        
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
