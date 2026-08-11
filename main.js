/* ==========================================================================
   Souqna - Iraq Classifieds Interactive Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initCountdown();
    initSubscribeForm();
});

/* --------------------------------------------------------------------------
   1. Theme Toggle (Light / Dark Mode)
   -------------------------------------------------------------------------- */
function initTheme() {
    const themeBtn = document.getElementById('theme-toggle');
    const htmlEl = document.documentElement;

    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('souqna_theme');
    if (savedTheme) {
        htmlEl.setAttribute('data-theme', savedTheme);
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        htmlEl.setAttribute('data-theme', 'dark');
    }

    themeBtn.addEventListener('click', () => {
        const currentTheme = htmlEl.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        htmlEl.setAttribute('data-theme', newTheme);
        localStorage.setItem('souqna_theme', newTheme);
        showToast(newTheme === 'dark' ? 'تم تفعيل الوضع الداكن 🌙' : 'تم تفعيل الوضع الفاتح ☀️');
    });
}

/* --------------------------------------------------------------------------
   2. Live Countdown Timer
   -------------------------------------------------------------------------- */
function initCountdown() {
    // Target launch date: 14 days from initial load
    let launchDate = localStorage.getItem('souqna_launch_date');
    if (!launchDate) {
        const target = new Date();
        target.setDate(target.getDate() + 14);
        target.setHours(target.getHours() + 8);
        launchDate = target.getTime();
        localStorage.setItem('souqna_launch_date', launchDate);
    } else {
        launchDate = parseInt(launchDate, 10);
    }

    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');

    function updateTimer() {
        const now = new Date().getTime();
        const distance = launchDate - now;

        if (distance < 0) {
            daysEl.innerText = '00';
            hoursEl.innerText = '00';
            minutesEl.innerText = '00';
            secondsEl.innerText = '00';
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        daysEl.innerText = days < 10 ? '0' + days : days;
        hoursEl.innerText = hours < 10 ? '0' + hours : hours;
        minutesEl.innerText = minutes < 10 ? '0' + minutes : minutes;
        secondsEl.innerText = seconds < 10 ? '0' + seconds : seconds;
    }

    updateTimer();
    setInterval(updateTimer, 1000);
}

/* --------------------------------------------------------------------------
   3. Subscription Form Handling
   -------------------------------------------------------------------------- */
function initSubscribeForm() {
    const form = document.getElementById('subscribe-form');
    const contactInput = document.getElementById('user-contact');

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const value = contactInput.value.trim();

        if (!value) {
            showToast('الرجاء إدخال البريد الإلكتروني أو رقم الهاتف!');
            return;
        }

        // Save in localStorage (Mock storage)
        const subscribers = JSON.parse(localStorage.getItem('souqna_subscribers') || '[]');
        subscribers.push({ contact: value, date: new Date().toISOString() });
        localStorage.setItem('souqna_subscribers', JSON.stringify(subscribers));

        showToast('🎉 شكرًا لاشتراكك! سنتواصل معك فور إطلاق "سوقنا".');
        contactInput.value = '';
    });
}

/* --------------------------------------------------------------------------
   4. Search Preview & Quick Fill
   -------------------------------------------------------------------------- */
window.fillSearch = function(query) {
    const searchInput = document.getElementById('search-query');
    searchInput.value = query;
    showSearchToast();
};

window.showSearchToast = function() {
    const query = document.getElementById('search-query').value || 'الإعلانات';
    const citySelect = document.getElementById('city-select');
    const cityText = citySelect.options[citySelect.selectedIndex].text;
    showToast(`🔍 تجربة بحث عن: "${query}" في (${cityText}). انتظرنا عند الإطلاق!`);
};

/* --------------------------------------------------------------------------
   5. Category & City Interactive Toasts
   -------------------------------------------------------------------------- */
window.showCategoryToast = function(categoryName) {
    showToast(`✨ قسم "${categoryName}" سيكون متاحاً بالكامل قريباً مع آلاف الإعلانات!`);
};

window.selectCityChip = function(chipEl, cityName) {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chipEl.classList.add('active');

    // Update select dropdown
    const citySelect = document.getElementById('city-select');
    for (let i = 0; i < citySelect.options.length; i++) {
        if (citySelect.options[i].text.includes(cityName)) {
            citySelect.selectedIndex = i;
            break;
        }
    }

    showToast(`📍 تم تحديد محافظة: ${cityName}`);
};

/* --------------------------------------------------------------------------
   6. Toast Utility Function
   -------------------------------------------------------------------------- */
let toastTimeout;
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');

    toastText.innerText = message;
    toast.classList.add('show');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}
