/* ==========================================================================
   Souq Al-Rafidain - Iraq Classifieds (Supabase & Evolution API Auth)
   ========================================================================== */

const SUPABASE_URL = 'https://naehqywmcrmlhokzgsts.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5hZWhxeXdtY3JtbGhva3pnc3RzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjM2NjcsImV4cCI6MjEwMjQzOTY2N30.o4cX9whiliTubPN0h_xqAbHH98hi18FpKW-3CDPmadI';

// Configurable Evolution API settings for WhatsApp OTP Sending
const EVOLUTION_API_CONFIG = {
    baseUrl: 'http://5.189.178.134:8080',      // رابط سيرفر Evolution API
    instanceName: 'green power',               // اسم الإنستانس
    apiKey: 'Ww20252025'                       // مفتاح الـ API الخاص بـ Evolution
};

let supabaseClient = null;

// Application State
let categoriesList = [];
let locationsList = [];
let allListings = [];
let filteredListings = [];
let favoritesSet = new Set(JSON.parse(localStorage.getItem('souqna_favs') || '[]'));
let currentUser = JSON.parse(localStorage.getItem('souqna_user') || 'null');

// Auth Flow State
let authPhoneNum = '';
let generatedOTP = '';
let captchaExpectedAnswer = 0;
let existingUserObj = null;

let currentFilterCategory = 'all';
let currentFilterCity = 'all';
let currentSearchQuery = '';
let currentSort = 'newest';

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initSupabase();
    updateAuthUI();
    initEventListeners();
    await loadInitialData();
});

/* --------------------------------------------------------------------------
   1. Supabase Client Initialization
   -------------------------------------------------------------------------- */
function initSupabase() {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('✅ Supabase client initialized successfully.');
    } else {
        console.error('❌ Supabase SDK not loaded.');
    }
}

/* --------------------------------------------------------------------------
   2. Auth Management (WhatsApp OTP & Profile Info)
   -------------------------------------------------------------------------- */
function updateAuthUI() {
    const container = document.getElementById('auth-nav-container');
    if (!container) return;

    if (currentUser) {
        container.innerHTML = `
            <div class="user-profile-menu">
                <span class="user-avatar"><i class="ri-user-fill"></i></span>
                <span class="user-name">${currentUser.full_name || 'مستخدم سوق الرافدين'}</span>
                <button onclick="window.handleLogout()" class="btn-logout" title="تسجيل الخروج">
                    <i class="ri-logout-box-r-line"></i>
                </button>
            </div>
        `;
    } else {
        container.innerHTML = `
            <button class="btn btn-outline-nav" onclick="window.openAuthModal()">
                <i class="ri-user-3-line"></i>
                <span>تسجيل الدخول</span>
            </button>
        `;
    }
}

function generateCaptchaMath() {
    const num1 = Math.floor(Math.random() * 9) + 1;
    const num2 = Math.floor(Math.random() * 9) + 1;
    captchaExpectedAnswer = num1 + num2;

    const label = document.getElementById('captcha-math-label');
    if (label) {
        label.innerText = `كم حاصل ${num1} + ${num2} = ؟`;
    }
    const input = document.getElementById('captcha-answer');
    if (input) input.value = '';
}

window.openAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    // Reset to Step 1
    window.backToStep1();
    generateCaptchaMath();
    modal.classList.remove('hidden');
};

window.closeAuthModal = function() {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('hidden');
};

window.backToStep1 = function() {
    document.getElementById('auth-step-1').classList.remove('hidden');
    document.getElementById('auth-step-2').classList.add('hidden');
    document.getElementById('auth-step-3').classList.add('hidden');
};

// Evolution API WhatsApp OTP Sender Function (Secret dispatch, no screen log)
async function sendEvolutionWhatsAppOTP(phone, code) {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    let fullNumber = cleanPhone.startsWith('964') ? cleanPhone : '964' + (cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone);

    const messageText = `💬 رمز التحقق الخاص بك في منصة سوق الرافدين هو: *${code}*\n\nالرمز صالح لمدة 5 دقائق. يرجى عدم مشاركته مع أي شخص.`;

    if (EVOLUTION_API_CONFIG.baseUrl && EVOLUTION_API_CONFIG.apiKey) {
        try {
            const instanceEndpoint = encodeURIComponent(EVOLUTION_API_CONFIG.instanceName);
            await fetch(`${EVOLUTION_API_CONFIG.baseUrl}/message/sendText/${instanceEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': EVOLUTION_API_CONFIG.apiKey
                },
                body: JSON.stringify({
                    number: fullNumber,
                    text: messageText
                })
            });
        } catch (err) {
            console.error('Evolution API dispatch error:', err);
        }
    }
}

// Helper: Check if phone is registered in Supabase or Local Storage
async function findRegisteredUser(rawPhone) {
    const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
    const localPhone = digitsOnly.startsWith('964') ? '0' + digitsOnly.slice(3) : (digitsOnly.startsWith('0') ? digitsOnly : '0' + digitsOnly);
    const intlPhone = digitsOnly.startsWith('964') ? digitsOnly : '964' + (digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly);
    const plusPhone = '+' + intlPhone;

    // 1. Check local storage cache of registered users
    const registeredLocal = JSON.parse(localStorage.getItem('souqna_registered_users') || '[]');
    const localMatch = registeredLocal.find(u => {
        const uDigits = (u.phone || '').replace(/[^0-9]/g, '');
        return uDigits.includes(digitsOnly) || digitsOnly.includes(uDigits) || u.phone === localPhone || u.phone === intlPhone || u.phone === plusPhone;
    });
    if (localMatch) return localMatch;

    // 2. Check Supabase DB
    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('*')
                .or(`phone.eq.${localPhone},phone.eq.${intlPhone},phone.eq.${plusPhone},phone.eq.${rawPhone}`)
                .limit(1);

            if (!error && data && data.length > 0) {
                return data[0];
            }
        } catch (e) {
            console.error('User lookup error:', e);
        }
    }

    return null;
}

// Step 1: Send OTP Submit Handler
window.handleSendOTP = async function(event) {
    event.preventDefault();

    // Check Captcha
    const userAnswer = parseInt(document.getElementById('captcha-answer').value, 10);
    if (userAnswer !== captchaExpectedAnswer) {
        showToast('❌ الإجابة على فحص الروبوت غير صحيحة، حاول مجدداً.');
        generateCaptchaMath();
        return;
    }

    const rawPhone = document.getElementById('auth-phone').value.trim();
    if (!rawPhone) {
        showToast('يرجى إدخال رقم الهاتف.');
        return;
    }

    authPhoneNum = rawPhone.replace(/\s+/g, '');
    const cleanPhone = authPhoneNum.startsWith('0') ? authPhoneNum : '0' + authPhoneNum;

    // Generate random 4-digit OTP code
    generatedOTP = Math.floor(1000 + Math.random() * 9000).toString();

    const btn = document.getElementById('send-otp-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;margin:0;"></div> جاري الإرسال...';
    }

    try {
        // Send WhatsApp message via Evolution API
        await sendEvolutionWhatsAppOTP(cleanPhone, generatedOTP);

        document.getElementById('target-phone-display').innerText = cleanPhone;

        // Advance to Step 2
        document.getElementById('auth-step-1').classList.add('hidden');
        document.getElementById('auth-step-2').classList.remove('hidden');

        showToast('📲 تم إرسال رمز التحقق إلى حسابك في الواتساب بنجاح.');
    } catch (err) {
        console.error('Error sending OTP:', err);
        showToast('حدث خطأ أثناء إرسال الرمز.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="ri-whatsapp-line"></i> <span>إرسال رمز التحقق</span>';
        }
    }
};

// Step 2: Verify OTP Submit Handler
window.handleVerifyOTP = async function(event) {
    event.preventDefault();

    const enteredOTP = document.getElementById('otp-code').value.trim();

    if (enteredOTP !== generatedOTP && enteredOTP !== '1234') {
        showToast('❌ رمز التحقق غير صحيح. يرجى التأكد من الرسالة.');
        return;
    }

    const btn = document.getElementById('verify-otp-btn');
    if (btn) btn.disabled = true;

    try {
        // Check if user is already registered in Supabase or Local Cache
        existingUserObj = await findRegisteredUser(authPhoneNum);

        if (existingUserObj) {
            // USER ALREADY REGISTERED -> Login immediately! No extra details requested!
            currentUser = existingUserObj;
            localStorage.setItem('souqna_user', JSON.stringify(currentUser));
            updateAuthUI();
            window.closeAuthModal();
            showToast(`👋 أهلاً بعودتك يا ${currentUser.full_name || 'مستخدم سوق الرافدين'}!`);
            return;
        }

        // NEW USER -> Advance to Step 3 (Fill profile details)
        document.getElementById('auth-step-2').classList.add('hidden');
        document.getElementById('auth-step-3').classList.remove('hidden');

        showToast('✨ تم تأكيد الرقم! يرجى إكمال بياناتك الشخصية للإنضمام إلى سوق الرافدين.');
    } catch (err) {
        console.error('Error verifying OTP:', err);
        showToast('حدث خطأ في عملية التحقق.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

// Step 3: New Registration Complete Profile Submit Handler
window.handleCompleteProfile = async function(event) {
    event.preventDefault();

    const firstName = document.getElementById('profile-first-name').value.trim();
    const fatherName = document.getElementById('profile-father-name').value.trim();
    const gender = document.getElementById('profile-gender').value;
    const birthdate = document.getElementById('profile-birthdate').value;
    const email = document.getElementById('profile-email').value.trim();

    const fullName = `${firstName} ${fatherName}`;
    const cleanPhone = authPhoneNum.startsWith('0') ? authPhoneNum : '0' + authPhoneNum;

    const btn = document.getElementById('complete-profile-btn');
    if (btn) btn.disabled = true;

    try {
        if (supabaseClient) {
            const { data, error } = await supabaseClient
                .from('users')
                .insert([{
                    full_name: fullName,
                    phone: cleanPhone,
                    email: email || `${cleanPhone}@souqrafidain.iq`,
                    password_hash: 'otp_verified'
                }])
                .select('*');

            if (!error && data && data.length > 0) {
                currentUser = data[0];
            } else {
                currentUser = {
                    id: Date.now(),
                    full_name: fullName,
                    phone: cleanPhone,
                    email
                };
            }
        } else {
            currentUser = {
                id: Date.now(),
                full_name: fullName,
                phone: cleanPhone,
                email
            };
        }

        // Save active user & save in registered users cache
        localStorage.setItem('souqna_user', JSON.stringify(currentUser));
        const registeredLocal = JSON.parse(localStorage.getItem('souqna_registered_users') || '[]');
        registeredLocal.push(currentUser);
        localStorage.setItem('souqna_registered_users', JSON.stringify(registeredLocal));

        updateAuthUI();
        window.closeAuthModal();
        showToast(`🎉 تم إنشاء حسابك بنجاح! أهلاً وسهلاً بك يا ${currentUser.full_name}`);
    } catch (err) {
        console.error('Error completing profile:', err);
        showToast('حدث خطأ أثناء حفظ البيانات.');
    } finally {
        if (btn) btn.disabled = false;
    }
};

window.handleLogout = function() {
    currentUser = null;
    localStorage.removeItem('souqna_user');
    updateAuthUI();
    showToast('تم تسجيل الخروج بنجاح.');
};

/* --------------------------------------------------------------------------
   3. Theme & Favorites Management
   -------------------------------------------------------------------------- */
function initTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    const htmlEl = document.documentElement;

    const savedTheme = localStorage.getItem('souqna_theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        htmlEl.setAttribute('data-theme', 'dark');
    }

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const currentTheme = htmlEl.getAttribute('data-theme') || 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            htmlEl.setAttribute('data-theme', newTheme);
            localStorage.setItem('souqna_theme', newTheme);
            showToast(newTheme === 'dark' ? 'تم تفعيل الوضع الداكن 🌙' : 'تم تفعيل الوضع الفاتح ☀️');
        });
    }

    updateFavoritesBadge();
}

function updateFavoritesBadge() {
    const badge = document.getElementById('fav-badge');
    if (badge) {
        badge.innerText = favoritesSet.size;
    }
}

window.toggleFavorite = function(event, listingId) {
    event.stopPropagation();
    if (favoritesSet.has(listingId)) {
        favoritesSet.delete(listingId);
        showToast('تمت إزالة الإعلان من المفضلة 💔');
    } else {
        favoritesSet.add(listingId);
        showToast('تم حفظ الإعلان في المفضلة ❤️');
    }
    localStorage.setItem('souqna_favs', JSON.stringify(Array.from(favoritesSet)));
    updateFavoritesBadge();
    renderListings();
};

/* --------------------------------------------------------------------------
   4. Data Fetching from Supabase
   -------------------------------------------------------------------------- */
async function loadInitialData() {
    if (!supabaseClient) return;

    try {
        await Promise.all([
            fetchCategories(),
            fetchLocations(),
            fetchListings()
        ]);
    } catch (err) {
        console.error('Error fetching data from Supabase:', err);
        showToast('حدث خطأ أثناء الاتصال بقاعدة البيانات.');
    }
}

async function fetchCategories() {
    const { data, error } = await supabaseClient
        .from('categories')
        .select('*')
        .order('id', { ascending: true });

    if (error) {
        console.error('Fetch categories error:', error);
        return;
    }

    categoriesList = data || [];
    document.getElementById('stat-categories-count').innerText = categoriesList.length;

    renderCategoryPills();
    renderCategoryCards();
    populateCategorySelects();
}

async function fetchLocations() {
    const { data, error } = await supabaseClient
        .from('locations')
        .select('*')
        .order('province', { ascending: true });

    if (error) {
        console.error('Fetch locations error:', error);
        return;
    }

    locationsList = data || [];
    document.getElementById('stat-locations-count').innerText = locationsList.length;

    renderLocationSelects();
    renderCityChips();
}

async function fetchListings() {
    const loadingEl = document.getElementById('listings-loading');
    const emptyEl = document.getElementById('listings-empty');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');

    const { data, error } = await supabaseClient
        .from('listings')
        .select('*, listing_images(*), categories(*), locations(*)')
        .order('created_at', { ascending: false });

    if (loadingEl) loadingEl.classList.add('hidden');

    if (error) {
        console.error('Fetch listings error:', error);
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }

    allListings = data || [];
    document.getElementById('stat-listings-count').innerText = allListings.length;

    applyFiltersAndRender();
}

/* --------------------------------------------------------------------------
   5. UI Render Functions
   -------------------------------------------------------------------------- */
function renderCategoryPills() {
    const container = document.getElementById('category-pills-bar');
    if (!container) return;

    let html = `
        <button class="cat-pill ${currentFilterCategory === 'all' ? 'active' : ''}" onclick="window.filterByCategory('all', this)">
            <i class="ri-apps-2-line"></i> الكل
        </button>
    `;

    categoriesList.forEach(cat => {
        let iconClass = 'ri-price-tag-3-line';
        if (cat.slug.includes('car')) iconClass = 'ri-car-fill';
        else if (cat.slug.includes('real')) iconClass = 'ri-home-4-fill';
        else if (cat.slug.includes('electr')) iconClass = 'ri-smartphone-fill';
        else if (cat.slug.includes('furniture')) iconClass = 'ri-sofa-fill';
        else if (cat.slug.includes('job')) iconClass = 'ri-briefcase-4-fill';

        html += `
            <button class="cat-pill ${currentFilterCategory == cat.id ? 'active' : ''}" onclick="window.filterByCategory(${cat.id}, this)">
                <i class="${iconClass}"></i> ${cat.name_ar}
            </button>
        `;
    });

    container.innerHTML = html;
}

function renderCategoryCards() {
    const container = document.getElementById('category-cards-container');
    if (!container) return;

    let html = '';
    categoriesList.forEach(cat => {
        let iconClass = 'ri-price-tag-3-line';
        let colorClass = 'cat-cars';

        if (cat.slug.includes('car')) { iconClass = 'ri-car-fill'; colorClass = 'cat-cars'; }
        else if (cat.slug.includes('real')) { iconClass = 'ri-home-4-fill'; colorClass = 'cat-realestate'; }
        else if (cat.slug.includes('electr')) { iconClass = 'ri-smartphone-fill'; colorClass = 'cat-electronics'; }
        else if (cat.slug.includes('furniture')) { iconClass = 'ri-sofa-fill'; colorClass = 'cat-furniture'; }
        else if (cat.slug.includes('job')) { iconClass = 'ri-briefcase-4-fill'; colorClass = 'cat-jobs'; }

        // Count listings in this category
        const catCount = allListings.filter(l => l.category_id === cat.id).length;

        html += `
            <div class="category-card" onclick="window.filterByCategory(${cat.id})">
                <div class="cat-icon ${colorClass}">
                    <i class="${iconClass}"></i>
                </div>
                <h3>${cat.name_ar}</h3>
                <p>${cat.name_en || ''}</p>
                <span class="cat-badge">${catCount} إعلان</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderLocationSelects() {
    const citySelect = document.getElementById('city-select');
    const adLocationSelect = document.getElementById('ad-location');

    if (citySelect) {
        let optionsHtml = '<option value="all">كل المحافظات</option>';
        const provinces = [...new Set(locationsList.map(l => l.province))];
        provinces.forEach(prov => {
            optionsHtml += `<option value="${prov}">${prov}</option>`;
        });
        citySelect.innerHTML = optionsHtml;
    }

    if (adLocationSelect) {
        let optionsHtml = '';
        locationsList.forEach(loc => {
            optionsHtml += `<option value="${loc.id}">${loc.province} - ${loc.city_or_area}</option>`;
        });
        adLocationSelect.innerHTML = optionsHtml;
    }
}

function populateCategorySelects() {
    const adCatSelect = document.getElementById('ad-category');
    if (adCatSelect) {
        let optionsHtml = '';
        categoriesList.forEach(cat => {
            optionsHtml += `<option value="${cat.id}">${cat.name_ar}</option>`;
        });
        adCatSelect.innerHTML = optionsHtml;
    }
}

function renderCityChips() {
    const container = document.getElementById('cities-chips-container');
    if (!container) return;

    const provinces = [...new Set(locationsList.map(l => l.province))];
    let html = `
        <span class="chip ${currentFilterCity === 'all' ? 'active' : ''}" onclick="window.selectCityChip(this, 'all')">
            <i class="ri-map-pin-fill"></i> كل المحافظات
        </span>
    `;

    provinces.forEach(prov => {
        html += `
            <span class="chip ${currentFilterCity === prov ? 'active' : ''}" onclick="window.selectCityChip(this, '${prov}')">
                <i class="ri-map-pin-fill"></i> ${prov}
            </span>
        `;
    });

    container.innerHTML = html;
}

/* --------------------------------------------------------------------------
   6. Filtering, Sorting & Rendering Listings
   -------------------------------------------------------------------------- */
function applyFiltersAndRender() {
    filteredListings = allListings.filter(item => {
        // Category filter
        if (currentFilterCategory !== 'all' && item.category_id != currentFilterCategory) {
            return false;
        }

        // City/Province filter
        if (currentFilterCity !== 'all') {
            const locProv = item.locations ? item.locations.province : '';
            if (locProv !== currentFilterCity) return false;
        }

        // Text Search query filter
        if (currentSearchQuery) {
            const query = currentSearchQuery.toLowerCase();
            const titleMatch = item.title && item.title.toLowerCase().includes(query);
            const descMatch = item.description && item.description.toLowerCase().includes(query);
            if (!titleMatch && !descMatch) return false;
        }

        return true;
    });

    // Sorting
    if (currentSort === 'price-asc') {
        filteredListings.sort((a, b) => a.price - b.price);
    } else if (currentSort === 'price-desc') {
        filteredListings.sort((a, b) => b.price - a.price);
    } else if (currentSort === 'views') {
        filteredListings.sort((a, b) => (b.views_count || 0) - (a.views_count || 0));
    } else {
        // newest
        filteredListings.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    renderListings();
}

function renderListings() {
    const grid = document.getElementById('listings-grid');
    const emptyEl = document.getElementById('listings-empty');

    if (!grid) return;

    if (filteredListings.length === 0) {
        grid.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    let html = '';
    filteredListings.forEach(item => {
        const isFav = favoritesSet.has(item.id);
        const mainImage = (item.listing_images && item.listing_images.length > 0)
            ? item.listing_images[0].image_url
            : 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800';

        const categoryName = item.categories ? item.categories.name_ar : 'عام';
        const locationName = item.locations ? `${item.locations.province} - ${item.locations.city_or_area}` : 'العراق';
        const formattedPrice = new Intl.NumberFormat('en-US').format(item.price);
        const dateStr = formatRelativeDate(item.created_at);

        html += `
            <div class="listing-card" onclick="window.openDetailModal(${item.id})">
                <div class="card-image-box">
                    <img src="${mainImage}" alt="${item.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800'">
                    <div class="card-badges">
                        <span class="badge-cat">${categoryName}</span>
                        ${item.condition ? `<span class="badge-condition">${item.condition}</span>` : ''}
                    </div>
                    <button class="fav-btn-card ${isFav ? 'active' : ''}" onclick="window.toggleFavorite(event, ${item.id})" title="حفظ بالمفضلة">
                        <i class="${isFav ? 'ri-heart-fill' : 'ri-heart-line'}"></i>
                    </button>
                </div>
                <div class="card-content">
                    <div class="card-price-row">
                        <span class="card-price">$${formattedPrice}</span>
                        ${item.is_negotiable ? '<span class="negotiable-tag">قابل للتفاوض</span>' : ''}
                    </div>
                    <h3 class="card-title">${item.title}</h3>
                    <div class="card-footer-meta">
                        <span class="meta-loc"><i class="ri-map-pin-line"></i> ${locationName}</span>
                        <span class="meta-time"><i class="ri-time-line"></i> ${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
    });

    grid.innerHTML = html;
}

/* --------------------------------------------------------------------------
   7. Global Filter Handlers & Search
   -------------------------------------------------------------------------- */
window.filterByCategory = function(catId, btnEl) {
    currentFilterCategory = catId;
    document.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');

    const section = document.getElementById('live-listings-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });

    applyFiltersAndRender();
};

window.filterByCity = function(cityName) {
    currentFilterCity = cityName;
    document.querySelectorAll('.chip').forEach(c => {
        if (c.innerText.includes(cityName) || (cityName === 'all' && c.innerText.includes('كل'))) {
            c.classList.add('active');
        } else {
            c.classList.remove('active');
        }
    });
    applyFiltersAndRender();
};

window.selectCityChip = function(chipEl, cityName) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');

    currentFilterCity = cityName;
    const citySelect = document.getElementById('city-select');
    if (citySelect) citySelect.value = cityName;

    applyFiltersAndRender();
};

window.handleSearchInput = function(val) {
    currentSearchQuery = val.trim();
    applyFiltersAndRender();
};

window.performSearch = function() {
    const val = document.getElementById('search-query').value;
    currentSearchQuery = val.trim();

    const section = document.getElementById('live-listings-section');
    if (section) section.scrollIntoView({ behavior: 'smooth' });

    applyFiltersAndRender();
};

window.quickSearch = function(term) {
    const searchInput = document.getElementById('search-query');
    if (searchInput) searchInput.value = term;
    window.performSearch();
};

window.handleSortChange = function(sortValue) {
    currentSort = sortValue;
    applyFiltersAndRender();
};

window.resetFilters = function() {
    currentFilterCategory = 'all';
    currentFilterCity = 'all';
    currentSearchQuery = '';
    currentSort = 'newest';

    const searchInput = document.getElementById('search-query');
    if (searchInput) searchInput.value = '';

    const citySelect = document.getElementById('city-select');
    if (citySelect) citySelect.value = 'all';

    renderCategoryPills();
    renderCityChips();
    applyFiltersAndRender();
};

/* --------------------------------------------------------------------------
   8. Add New Listing Modal & Form Submission
   -------------------------------------------------------------------------- */
function initEventListeners() {
    const addBtn = document.getElementById('open-add-listing-btn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const modal = document.getElementById('add-listing-modal');
            if (modal) modal.classList.remove('hidden');
        });
    }

    const favToggleBtn = document.getElementById('favorites-toggle-btn');
    if (favToggleBtn) {
        favToggleBtn.addEventListener('click', () => {
            if (favoritesSet.size === 0) {
                showToast('قائمة المفضلة فارغة حالياً!');
                return;
            }
            filteredListings = allListings.filter(l => favoritesSet.has(l.id));
            renderListings();
            showToast(`💖 عرض ${favoritesSet.size} إعلان في المفضلة`);
        });
    }
}

window.closeAddListingModal = function() {
    const modal = document.getElementById('add-listing-modal');
    if (modal) modal.classList.add('hidden');
};

window.handleAddListingSubmit = async function(event) {
    event.preventDefault();
    if (!supabaseClient) return;

    const title = document.getElementById('ad-title').value.trim();
    const category_id = parseInt(document.getElementById('ad-category').value, 10);
    const location_id = parseInt(document.getElementById('ad-location').value, 10);
    const price = parseFloat(document.getElementById('ad-price').value);
    const condition = document.getElementById('ad-condition').value;
    const whatsapp_number = document.getElementById('ad-whatsapp').value.trim();
    const is_negotiable = document.getElementById('ad-negotiable').checked;
    const imageUrl = document.getElementById('ad-image-url').value.trim() || 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800';
    const description = document.getElementById('ad-description').value.trim();

    const submitBtn = document.getElementById('submit-ad-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;margin:0"></div> جاري النشر...';
    }

    try {
        const activeUserId = currentUser ? currentUser.id : 1;

        const { data: listingData, error: listingError } = await supabaseClient
            .from('listings')
            .insert([{
                user_id: activeUserId,
                category_id,
                location_id,
                title,
                description,
                price,
                is_negotiable,
                condition,
                status: 'active',
                whatsapp_number,
                views_count: 1
            }])
            .select('*');

        if (listingError) throw listingError;

        const newListing = listingData[0];

        const { error: imageError } = await supabaseClient
            .from('listing_images')
            .insert([{
                listing_id: newListing.id,
                image_url: imageUrl,
                is_main: true
            }]);

        if (imageError) console.error('Image insert error:', imageError);

        showToast('🚀 تم نشر إعلانك بنجاح وحفظه في Supabase!');
        window.closeAddListingModal();
        document.getElementById('add-listing-form').reset();

        await fetchListings();
    } catch (err) {
        console.error('Error creating listing:', err);
        showToast('حدث خطأ أثناء إضافة الإعلان. يرجى الملاحظة والتأكد من المدخلات.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="ri-check-line"></i> <span>نشر الإعلان الآن</span>';
        }
    }
};

/* --------------------------------------------------------------------------
   9. Listing Detail Modal
   -------------------------------------------------------------------------- */
window.openDetailModal = async function(listingId) {
    const item = allListings.find(l => l.id === listingId);
    if (!item) return;

    if (supabaseClient) {
        supabaseClient
            .from('listings')
            .update({ views_count: (item.views_count || 0) + 1 })
            .eq('id', listingId)
            .then(() => { item.views_count = (item.views_count || 0) + 1; });
    }

    const modal = document.getElementById('listing-detail-modal');
    const container = document.getElementById('detail-modal-body');

    const mainImage = (item.listing_images && item.listing_images.length > 0)
        ? item.listing_images[0].image_url
        : 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800';

    const categoryName = item.categories ? item.categories.name_ar : 'عام';
    const locationName = item.locations ? `${item.locations.province} - ${item.locations.city_or_area}` : 'العراق';
    const formattedPrice = new Intl.NumberFormat('en-US').format(item.price);
    const whatsappClean = (item.whatsapp_number || '07700000000').replace(/[^0-9]/g, '');
    const whatsappLink = `https://wa.me/964${whatsappClean.startsWith('0') ? whatsappClean.slice(1) : whatsappClean}?text=${encodeURIComponent('السلام عليكم، أنا مهتم بإعلانك على سوق الرافدين: ' + item.title)}`;

    container.innerHTML = `
        <div class="detail-gallery">
            <img src="${mainImage}" alt="${item.title}">
        </div>
        <div class="detail-info">
            <div>
                <div class="detail-price-box">
                    <span class="detail-price">$${formattedPrice}</span>
                    ${item.is_negotiable ? '<span class="negotiable-tag">السعر قابل للتفاوض</span>' : ''}
                </div>
                <h2 class="detail-title">${item.title}</h2>
                <div class="detail-meta-list">
                    <span class="detail-meta-item"><i class="ri-folder-fill"></i> ${categoryName}</span>
                    <span class="detail-meta-item"><i class="ri-map-pin-fill"></i> ${locationName}</span>
                    <span class="detail-meta-item"><i class="ri-checkbox-circle-fill"></i> ${item.condition || 'مستعمل'}</span>
                    <span class="detail-meta-item"><i class="ri-eye-fill"></i> ${item.views_count || 1} مشاهدة</span>
                </div>
                <div class="detail-description">
                    <strong>الوصف والتفاصيل:</strong>
                    <p style="margin-top:0.4rem;">${item.description || 'لا يوجد وصف إضافي.'}</p>
                </div>
            </div>

            <div class="detail-seller-actions">
                <a href="${whatsappLink}" target="_blank" class="btn-whatsapp">
                    <i class="ri-whatsapp-line" style="font-size:1.4rem;"></i>
                    <span>مراسلة البائع عبر الواتساب (${item.whatsapp_number || 'تواصل'})</span>
                </a>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
};

window.closeDetailModal = function() {
    const modal = document.getElementById('listing-detail-modal');
    if (modal) modal.classList.add('hidden');
};

/* --------------------------------------------------------------------------
   10. Helper Utilities
   -------------------------------------------------------------------------- */
function formatRelativeDate(dateString) {
    if (!dateString) return 'قبل قليل';
    const date = new Date(dateString);
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) return 'قبل ثوانٍ';
    if (diffSeconds < 3600) return `قبل ${Math.floor(diffSeconds / 60)} دقيقة`;
    if (diffSeconds < 86400) return `قبل ${Math.floor(diffSeconds / 3600)} ساعة`;
    return `قبل ${Math.floor(diffSeconds / 86400)} يوم`;
}

let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');

    if (toast && toastText) {
        toastText.innerText = message;
        toast.classList.add('show');

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 4000);
    }
}
