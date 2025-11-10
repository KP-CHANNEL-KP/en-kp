/**
 * Cloudflare Worker: 
 * Features: Browser Block, Key Validation (1DV/MULTI/MASTER), IP Locking (1DV), Expiration Check (MMT).
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

        // ======================================================================
        // 🔑 1. Key Validation & Type Check (MASTER Key Check အပါအဝင်)
        // ======================================================================
        try {
            // KV ကနေ Key Value ကို JSON Format ဖြင့် ဆွဲထုတ်
            const keyJson = await env[LICENSE_NAMESPACE].get(licenseKey); 
            
            // 1. Invalid Key (KV ထဲမှာ မရှိခြင်း)
            if (keyJson === null) { 
                return new Response("Invalid License Key. Please contact the administrator.", { status: 403 });
            }
            
            // JSON String ကို Object အဖြစ် ပြောင်းလဲ
            keyData = JSON.parse(keyJson); 

            // 2. MASTER Key Check: MASTER Key ဆိုရင် ကျန် Logic တွေအားလုံးကို ကျော်ပြီး Script ကို တန်းပို့မည်။
            if (keyData.type === 'MASTER') {
                console.log(`MASTER Key ${licenseKey} Access Granted.`);
                return fetchScript(TARGET_SCRIPT_URL);
            }

        } catch (e) {
            console.error(`Key Parsing/Validation Error: ${e.message}`);
            return new Response("An internal error occurred during key parsing or verification.", { status: 500 });
        }
        
        // ======================================================================
        // 🔐 2. IP Locking / 1DV Check (MULTI Key ကို ကျော်သည်)
        // ======================================================================
        if (keyData.type === '1DV' && clientIP) { 
            const currentIP = keyData.ip;
            
            // 1DV Check: IP Lock ထားတာနဲ့ မတူရင် Block ပါ
            // currentIP === 'active' ဆိုရင် ပထမဆုံးအကြိမ် အသုံးပြုခြင်း။
            if (currentIP && currentIP !== 'active' && currentIP !== clientIP) { 
                return new Response("Permission Denied: This license (1DV) is already in use by another IP.", { status: 403 });
            }

            // IP မှတ်သားခြင်း/Update လုပ်ခြင်း
            // Key Data ကို Update လုပ်ပြီး TTL ထည့်သွင်းမည်။
            keyData.ip = clientIP;
            await env[LICENSE_NAMESPACE].put(licenseKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
            // console.log(`License: ${licenseKey} locked to IP: ${clientIP}`); 
            
        } else if (!clientIP) {
             // 1DV Key ဖြစ်ပေမယ့် IP မရှိရင် Error ပေး (Cloudflare Config error)
             if (keyData.type === '1DV') {
                 return new Response("Configuration Error: Client IP not received.", { status: 500 });
             }
        }
        
        // ======================================================================
        // 🗓️ 3. Expiration Date Check Logic (MASTER Key မှလွဲ၍ အားလုံးစစ်)
        // ======================================================================
        try {
            const expiryResponse = await fetch(EXPIRY_LIST_URL);
            if (!expiryResponse.ok) {
                console.error("Failed to fetch expiry list.");
                // Fetch မလုပ်နိုင်ရင်တောင် Script ကို ပေးပို့ပါ (Service မပြတ်စေရန်)
            } else {
                const expiryText = await expiryResponse.text();
                const expiryMap = new Map();
                
                // key=date ပုံစံဖြင့် Map ထဲ ထည့်သွင်းခြင်း
                expiryText.split('\n').forEach(line => {
                    const [key, dateStr] = line.trim().split('=');
                    if (key && dateStr) {
                        expiryMap.set(key.trim(), dateStr.trim());
                    }
                });

                const expiryDateStr = expiryMap.get(licenseKey);

                if (expiryDateStr) {
                    // MMT Timezone Fix Logic
                    const expiryDate = new Date(expiryDateStr);
                    expiryDate.setHours(23 + 6, 30, 0, 0); // MMT End of Day (UTC +6:30)

                    const currentDate = new Date();
                    currentDate.setHours(currentDate.getUTCHours() + 6, currentDate.getUTCMinutes() + 30, 0, 0); // MMT Current Date Fix

                    // MMT End of Day Logic (Compare)
                    if (currentDate.getTime() > expiryDate.getTime()) {
                        console.warn(`License Key ${licenseKey} expired on ${expiryDateStr} (MMT).`);
                        return new Response(`License Expired on ${expiryDateStr} (MMT). Please renew.`, { status: 403 });
                    }
                }
            }
        } catch (error) {
            console.error(`Expiry Check Error: ${error.message}`);
        }

        // ======================================================================
        // 4. Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
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
