/**
 * Cloudflare Worker: 
 * Features: Key Validation (1DV/MULTI/MASTER), IP Locking (1DV), Expiration Check (MMT).
 * New Features: Admin Tools for Key Creation & IP Reset (URL-based control).
 * FIX: Final fix for URL Parsing (path and segments logic).
 */

// ----------------------------------------------------------------------
// --- CONFIGURATION ---
// ----------------------------------------------------------------------
const TARGET_SCRIPT_URL = "https://raw.githubusercontent.com/KP-CHANNEL-KP/gcp-vless-2/main/check-expiry-and-run-v2.sh";
const EXPIRY_LIST_URL = "https://raw.githubusercontent.com/YOUR_GITHUB_USER/YOUR_REPO/main/user_expiry_list.txt"; 
// 🚨 ပြင်ရမည်: သင့်ရဲ့ Admin Secret ကို Koplm890 လို့ ပြင်လိုက်ပါပြီ။
const ADMIN_SECRET = "Koplm890"; 
// ----------------------------------------------------------------------
const ALLOWED_USER_AGENTS = ['curl']; 
const IP_EXPIRATION_TTL = 31536000; // 1 နှစ်စာ (စက္ကန့်)
const LICENSE_NAMESPACE = 'LICENSES'; 

export default {
    async fetch(request, env) { 
        
        // 🛑 FIX: URL Path ကို တိကျစွာ ပိုင်းခြားယူခြင်း
        const url = new URL(request.url);
        const path = url.pathname; 
        const urlSegments = path.split('/').filter(segment => segment.length > 0);
        
        
        // ======================================================================
        // 🔑 1. ADMIN TOOL DISPATCHER (URL ပုံစံ: /ACTION/SECRET/TARGET)
        // ======================================================================
        if (urlSegments.length >= 3) {
            const [action, secret, targetKey] = urlSegments;
            
            if (secret === ADMIN_SECRET) {
                // Admin Secret မှန်ကန်ပါက Tool Logic ကို ဆက်လုပ်ပါ
                return handleAdminTool(action.toUpperCase(), targetKey, env);
            }
        }
        
        // ======================================================================
        // 💻 2. USER RUN VALIDATION LOGIC (URL ပုံစံ: /KEY-001)
        // ======================================================================
        
        const userAgent = request.headers.get('User-Agent') || '';
        if (!ALLOWED_USER_AGENTS.some(agent => userAgent.toLowerCase().includes(agent.toLowerCase()))) {
            return new Response("ဘားမှမသိချင်နဲ့ညီ အကိုမှလဲ ညီ့ကိုပြစရာ (လီး) ပဲရှိတယ်။😎", { status: 403 });
        }

        const clientIP = request.headers.get("cf-connecting-ip");
        const licenseKey = urlSegments.length > 0 ? urlSegments.pop() : 'KP'; 
        
        // Key validation ကို စတင်ပါ
        return handleUserValidation(licenseKey, clientIP, env);
    }
};

// ======================================================================
// --- ADMIN TOOL FUNCTIONS ---
// ======================================================================

async function handleAdminTool(action, targetKey, env) {
    if (!targetKey) {
        return new Response(`Error: Missing target key for ${action}. Usage: /${action}/${ADMIN_SECRET}/KEY_NAME`, { status: 400 });
    }

    let keyJson = await env[LICENSE_NAMESPACE].get(targetKey);
    let keyData;

    switch (action) {
        case 'CREATE':
            // 1. Key ကို Expiry List မှာ စစ်ဆေးရန် (လုံခြုံမှုအတွက်)
            const expiryCheck = await checkExpiryList(targetKey);
            if (!expiryCheck.exists) {
                 return new Response(`Key Creation Failed: ${targetKey} not found in Expiry List. Key must exist there first.`, { status: 403 });
            }

            // 2. KV မှာ Key ရှိပြီးသားဆိုရင် ပြန်မဖန်တီးပါ
            if (keyJson !== null) {
                return new Response(`Key Creation Failed: ${targetKey} already exists in KV.`, { status: 400 });
            }

            // 3. Key အသစ် (1DV) ကို ဖန်တီးပါ
            keyData = { type: "1DV", ip: "active" };
            await env[LICENSE_NAMESPACE].put(targetKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
            
            return new Response(`✅ SUCCESS: 1DV Key ${targetKey} created and ready to use. Expiry: ${expiryCheck.expiryDateStr}`, { status: 200 });

        case 'RESET':
            // 1. Key ကို KV မှာ စစ်ဆေးပါ
            if (keyJson === null) {
                return new Response(`IP Reset Failed: ${targetKey} not found in KV.`, { status: 404 });
            }
            
            keyData = JSON.parse(keyJson);
            
            // 2. 1DV Key ဟုတ်မဖျက် စစ်ဆေးပါ
            if (keyData.type !== '1DV') {
                return new Response(`IP Reset Failed: ${targetKey} is a ${keyData.type} key. Only 1DV keys can be reset.`, { status: 400 });
            }

            // 3. IP ကို active သို့ ပြန်ပြောင်းပါ
            keyData.ip = 'active';
            await env[LICENSE_NAMESPACE].put(targetKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
            
            return new Response(`✅ SUCCESS: IP Lock for ${targetKey} reset to 'active'.`, { status: 200 });

        default:
            return new Response(`Error: Invalid Admin Action '${action}'. Use 'CREATE' or 'RESET'.`, { status: 400 });
    }
}

// ======================================================================
// --- USER VALIDATION FUNCTIONS ---
// ======================================================================

async function handleUserValidation(licenseKey, clientIP, env) {
    let keyData; 
    
    // 1. KV မှ Key Data ကို ဆွဲထုတ်ခြင်း (Key must exist in KV now)
    try {
        const keyJson = await env[LICENSE_NAMESPACE].get(licenseKey); 
        
        // Key Must Exist in KV (Auto Creation Logic ကို Admin Tool သို့ ရွှေ့လိုက်ပြီ)
        if (keyJson === null) { 
            return new Response("Invalid License Key (Key not found in KV).", { status: 403 });
        }
        
        keyData = JSON.parse(keyJson); 

        // 2. MASTER Key Check: MASTER Key ဆိုရင် ကျန် Logic များ ကျော်၍ တန်းပေးပါ
        if (keyData.type === 'MASTER') {
            return fetchScript(TARGET_SCRIPT_URL);
        }

    } catch (e) {
        return new Response("An internal error occurred during key parsing or verification.", { status: 500 });
    }
    
    // 3. IP Locking / 1DV Check (MULTI Key ကို ကျော်သည်)
    if (keyData.type === '1DV' && clientIP) { 
        const currentIP = keyData.ip;
        
        if (currentIP && currentIP !== 'active' && currentIP !== clientIP) { 
            return new Response("Permission Denied: This license (1DV) is already in use by another IP.", { status: 403 });
        }

        // IP မှတ်သားခြင်း/Update လုပ်ခြင်း
        if (currentIP !== clientIP) {
            keyData.ip = clientIP;
            await env[LICENSE_NAMESPACE].put(licenseKey, JSON.stringify(keyData), { expirationTtl: IP_EXPIRATION_TTL });
        }
        
    } else if (keyData.type === '1DV' && !clientIP) {
        return new Response("Configuration Error: Client IP not received.", { status: 500 });
    }
    
    // 4. Expiration Date Check Logic
    const expiryCheck = await checkExpiryList(licenseKey);
    
    if (expiryCheck.exists && expiryCheck.isExpired) {
        return new Response(`License Expired on ${expiryCheck.expiryDateStr} (MMT). Please renew.`, { status: 403 });
    }

    // 5. Script Content ကို တောင်းယူပြီး ပေးပို့ပါမယ်။
    return fetchScript(TARGET_SCRIPT_URL);
}


// ======================================================================
// --- HELPER FUNCTIONS ---
// ======================================================================

async function checkExpiryList(licenseKey) {
    // ... (Function content is the same as before)
    try {
        const expiryResponse = await fetch(EXPIRY_LIST_URL);
        if (!expiryResponse.ok) {
            console.error("Failed to fetch expiry list.");
            return { exists: false, isExpired: false };
        }
        
        const expiryText = await expiryResponse.text();
        const expiryMap = new Map();
        
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
            // MMT (UTC+6:30) ည 11:59:59 အဖြစ် သတ်မှတ်
            expiryDate.setHours(23 + 6, 30, 0, 0); 

            const currentDate = new Date();
            // လက်ရှိအချိန်ကို MMT သို့ ပြောင်းလဲ
            currentDate.setHours(currentDate.getUTCHours() + 6, currentDate.getUTCMinutes() + 30, 0, 0); 

            if (currentDate.getTime() > expiryDate.getTime()) {
                return { exists: true, isExpired: true, expiryDateStr };
            }
            return { exists: true, isExpired: false, expiryDateStr };
        }
        
        return { exists: false, isExpired: false };

    } catch (error) {
        console.error(`Expiry Check Error: ${error.message}`);
        return { exists: false, isExpired: false };
    }
}

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
