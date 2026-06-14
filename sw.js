// ===== GHADAOUK SERVICE WORKER =====
// يشتغل في الخلفية حتى لما التطبيق مغلق

const SW_VERSION = 'ghadaouk-v1';
let notifSettings = {};
let goalCals = 2000;

// ===== INSTALL & ACTIVATE =====
self.addEventListener('install', event => {
  console.log('[SW] Installed');
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  console.log('[SW] Activated');
  event.waitUntil(clients.claim());
  // Tell the app we're ready
  self.clients.matchAll().then(clients => {
    clients.forEach(client => client.postMessage({ type: 'SW_READY' }));
  });
  // Start the notification scheduler
  startScheduler();
});

// ===== RECEIVE SETTINGS FROM APP =====
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SYNC_SETTINGS') {
    notifSettings = event.data.settings || {};
    goalCals = event.data.goalCals || 2000;
    console.log('[SW] Settings synced:', notifSettings);
  }
});

// ===== NOTIFICATION HELPER =====
const MEAL_MESSAGES = {
  breakfast: [
    'صباح الخير! اتفطرت إيه النهارده؟',
    'متنساش تسجّل فطارك في غذاؤك!',
    'فطارك وصل وقته، سجّله دلوقتي',
  ],
  lunch: [
    'جه وقت الغدا! سجّل أكلك دلوقتي',
    'الغدا على الباب، سجّله في غذاؤك',
    'أكلت الغدا؟ سجّله عشان تتابع هدفك',
  ],
  dinner: [
    'وقت العشا! سجّل آخر وجبة النهارده',
    'متنساش عشاك! هدفك في انتظارك',
    'سجّل عشاك وخلّص اليوم بشكل صح',
  ],
  water: [
    'اشربت مياه؟ جسمك محتاجك!',
    'وقت كوباية ماء، جسمك شاكرك',
    'تذكير: اشرب مياه دلوقتي',
  ],
  weight: [
    'حان وقت وزنك الأسبوعي! سجّله في غذاؤك',
    'الجمعة = يوم الوزن! كيلوهات الأسبوع دي إيه؟',
  ],
  summary: [
    'ملخص يومك جاهز، افتح غذاؤك تشوفه',
    'إزاي كان يومك الغذائي النهارده؟',
  ],
};

function getRandMsg(type) {
  const msgs = MEAL_MESSAGES[type] || ['تذكير من غذاؤك'];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

function sendNotif(title, body, tag) {
  return self.registration.showNotification(title, {
    body: body,
    icon: '/icon.png',
    badge: '/icon.png',
    tag: tag || 'ghadaouk-' + Date.now(),
    renotify: true,
    requireInteraction: false,
    actions: [
      { action: 'open', title: 'افتح التطبيق' },
      { action: 'dismiss', title: 'تجاهل' },
    ],
    data: { url: '/' },
  });
}

// ===== NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});

// ===== SCHEDULER =====
// Service Workers can't use setInterval reliably,
// so we use the 'periodicsync' if available, or push events from server
// Fallback: use setTimeout chain

function startScheduler() {
  // Use Periodic Background Sync if available (Chrome Android)
  if ('periodicSync' in self.registration) {
    console.log('[SW] Periodic Sync available');
  }
  // Schedule via setTimeout chain (works when SW is kept alive)
  checkAndSchedule();
}

function checkAndSchedule() {
  const now = new Date();
  // Calculate ms until next minute
  const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

  setTimeout(() => {
    runChecks();
    // Then repeat every minute
    setInterval(runChecks, 60000);
  }, msUntilNextMinute);
}

function runChecks() {
  const now = new Date();
  const hh = now.getHours();
  const mm = now.getMinutes();
  const timeStr = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
  const dayOfWeek = now.getDay();

  const s = notifSettings;

  // Meal reminders
  ['breakfast', 'lunch', 'dinner'].forEach(meal => {
    if (!s[meal]) return;
    const defaultTimes = { breakfast: '08:00', lunch: '13:00', dinner: '20:00' };
    const target = s['time_' + meal] || defaultTimes[meal];
    if (timeStr === target) {
      const mealAr = { breakfast: 'الفطار', lunch: 'الغدا', dinner: 'العشا' };
      sendNotif(
        `🥗 غذاؤك — ${mealAr[meal]}`,
        getRandMsg(meal),
        'meal-' + meal
      );
    }
  });

  // Water reminder every 2 hours
  if (s.water && mm === 0 && hh >= 8 && hh <= 22 && hh % 2 === 0) {
    sendNotif('🥗 غذاؤك — اشرب مياه', getRandMsg('water'), 'water');
  }

  // Weekly weight - Friday 9am
  if (s.weight && dayOfWeek === 5 && hh === 9 && mm === 0) {
    sendNotif('🥗 غذاؤك — تذكير الوزن', getRandMsg('weight'), 'weight');
  }

  // Daily summary 10pm
  if (s.summary && hh === 22 && mm === 0) {
    sendNotif('🥗 غذاؤك — ملخص اليوم', getRandMsg('summary'), 'summary');
  }
}

// ===== FETCH (cache strategy) =====
self.addEventListener('fetch', event => {
  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).catch(() => cached);
    })
  );
});
