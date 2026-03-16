// ── FIREBASE INIT ──
const firebaseConfig = {
  apiKey: "AIzaSyCPN-DiCXA6qEbSeLlIW_O8IXiTz575OM4",
  authDomain: "thisisskoop.firebaseapp.com",
  projectId: "thisisskoop",
  storageBucket: "thisisskoop.firebasestorage.app",
  messagingSenderId: "79877900507",
  appId: "1:79877900507:web:bc4496ce8d838b83a724fe"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ╔════════════════════════════════════════════════════════════════╗
// ║ FIREBASE SECURITY RULES SETUP (ACTIVE IN PRODUCTION)           ║
// ╚════════════════════════════════════════════════════════════════╝
// 
// ✅ FIRESTORE RULES - Already configured in Firebase Console
//    Your current rules allow:
//    - Public listing reads
//    - Auth users can create listings
//    - Only seller can update/delete own listing
//    - Users can read all profiles, write own profile
//    - Only conversation participants can read/write messages
//
// ⚠️ STORAGE RULES - Go to Firebase Console > Storage > Rules
//    Copy & paste (if not already configured):
//    
//    rules_version = '2';
//    service firebase.storage {
//      match /b/{bucket}/o {
//        match /listings/{userId}/{allPaths=**} {
//          allow read: if true;
//          allow write: if request.auth.uid == userId;
//          allow delete: if request.auth.uid == userId;
//        }
//      }
//    }

// ── GLOBAL STATE ──
let currentUser = null;
let pendingImg = null;
let listings = [];

function updateAuthUI() {
  const authNav = document.getElementById('authNav');
  const userNav = document.getElementById('userNav');
  
  if (currentUser) {
    authNav.style.display = 'none';
    userNav.style.display = 'flex';
    document.getElementById('userEmail').textContent = currentUser.email;
  } else {
    authNav.style.display = 'flex';
    userNav.style.display = 'none';
  }
  // Ensure overlays are closed when auth state changes
  closeOverlay('loginOverlay');
}

function switchToSignup(e) {
  e.preventDefault();
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
  document.getElementById('authTitle').textContent = 'Create your Skoop account';
}

function switchToLogin(e) {
  e.preventDefault();
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('signupForm').style.display = 'none';
  document.getElementById('authTitle').textContent = 'Sign in to Skoop';
}

async function handleLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  
  if (!email || !password) {
    showToast('warning', 'Please fill in all fields');
    return;
  }
  
  try {
    await firebase.auth().signInWithEmailAndPassword(email, password);
    showToast('check_circle', 'Logged in!');
    closeOverlay('loginOverlay');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
  } catch (error) {
    showToast('error', error.message);
  }
}

async function handleSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const phone = document.getElementById('signupPhone').value.trim();
  
  if (!name || !email || !password) {
    showToast('warning', 'Please fill in all required fields');
    return;
  }
  
  if (password.length < 6) {
    showToast('warning', 'Password must be at least 6 characters');
    return;
  }
  
  try {
    const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
    
    // Save user data to Firestore
    await db.collection('users').doc(result.user.uid).set({
      uid: result.user.uid,
      name: name,
      email: email,
      phone: phone,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      verifiedSeller: false,
      rating: 5,
      sales: 0
    });
    
    showToast('check_circle', 'Account created! Welcome to Skoop');
    closeOverlay('loginOverlay');
    document.getElementById('signupName').value = '';
    document.getElementById('signupEmail').value = '';
    document.getElementById('signupPassword').value = '';
    document.getElementById('signupPhone').value = '';
  } catch (error) {
    console.error('Signup error:', error);
    if (error.code === 'permission-denied') {
      showToast('error', 'Signup blocked: Firestore rules not set. Check Firebase Console.');
    } else {
      showToast('error', error.message);
    }
  }
}

// ── OVERLAY ──
function openOverlay(id) { 
  document.getElementById(id).classList.add('open'); 
  document.body.style.overflow='hidden'; 
}

function closeOverlay(id) { 
  document.getElementById(id).classList.remove('open'); 
  document.body.style.overflow=''; 
}

document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) closeOverlay(o.id); });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.overlay.open').forEach(o => closeOverlay(o.id));
});

// ── TOAST ──
let toastTimer;
function showToast(icon, msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastIcon').textContent = icon;
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function handleLogout() {
  firebase.auth().signOut().then(() => {
    showToast('check_circle', 'You sef don try, log in soon sha');
    listings = [];
    renderListings();
  });
}

async function loadUserListings() {
  if (!currentUser) return;
  try {
    // Real-time listener for user's own listings
    db.collection('listings')
      .where('sellerId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        const userListings = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          price: parseInt(doc.data().price)
        }));
        console.log(`User has ${userListings.length} listings`);
      });
  } catch (error) {
    console.log('Load user listings error:', error);
  }
}

// ── DATA ──
const COLORS = ['#d4522a','#2a6b3d','#4a5d8a','#8a4a6b','#5a6b2a','#2a7a8a'];
const CAT_ICONS = {
  Electronics:'devices', Books:'menu_book', Fashion:'checkroom',
  'Food & Biz':'restaurant', Services:'design_services', Furniture:'chair', Sports:'sports_soccer'
};
const COND_ICONS = { 'Brand New':'new_releases','Like New':'thumb_up','Good':'done','Fair':'warning_amber' };

let activeCat = 'all', activeSearch = '', sortMode = 'newest';
const wishlist = new Set();

// ⚠️ FIREBASE STORAGE SECURITY RULES (Add to Firebase Console):
// rules_version = '2';
// service firebase.storage {
//   match /b/{bucket}/o {
//     match /listings/{userId}/{allPaths=**} {
//       allow read: if true;
//       allow write: if request.auth.uid == userId;
//       allow delete: if request.auth.uid == userId;
//     }
//   }
// }

// Load all public listings from Firestore (real-time)
let listingsUnsubscribe = null;

async function loadAllListings() {
  // Stop previous listener if exists
  if (listingsUnsubscribe) listingsUnsubscribe();
  
  try {
    // Real-time listener for listings
    listingsUnsubscribe = db.collection('listings')
      .where('sold', '==', false)
      .orderBy('createdAt', 'desc')
      .onSnapshot(querySnapshot => {
        listings = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id,
          price: parseInt(doc.data().price)
        }));
        
        // If no listings from Firebase, use fallback
        if (listings.length === 0) {
          listings = fallbackListings;
        }
        renderListings();
      }, error => {
        console.error('Real-time listener error:', error);
        // Use fallback listings immediately on error
        listings = fallbackListings;
        renderListings();
      });
  } catch (error) {
    console.log('Error setting up real-time listener:', error);
    listings = fallbackListings;
    renderListings();
  }
}

// Fallback local data
const fallbackListings = [
  {id:1,title:'MacBook Pro M1 2021',price:420000,cat:'Electronics',seller:'Chidi O.',condition:'Like New',desc:'Barely used MacBook Pro M1, 8GB RAM, 256GB SSD. Battery health 98%. Comes with original charger and box.',phone:'+2348012345678',img:null},
  {id:2,title:'Morrison Boyd Organic Chemistry',price:4500,cat:'Books',seller:'Amina B.',condition:'Good',desc:'Organic Chemistry by Morrison Boyd. Some highlighting in chapters 1-5 only. Great overall condition.',phone:'+2348098765432',img:null},
  {id:3,title:'Jollof Rice Meal Packs — Daily Orders',price:1800,cat:'Food & Biz',seller:'Temi Foods',condition:'Brand New',desc:'Freshly cooked jollof rice with chicken or turkey. Orders by 8am, same-day delivery on campus.',phone:'+2348056781234',img:null},
  {id:4,title:'iPhone 13 128GB Sierra Blue',price:310000,cat:'Electronics',seller:'Femi A.',condition:'Good',desc:'iPhone 13, 128GB, Sierra Blue. Minor scratch on back, screen is perfect. Battery health 87%.',phone:'+2348034567890',img:null},
  {id:5,title:'Graphic Design Services',price:15000,cat:'Services',seller:'Zara Designs',condition:'Brand New',desc:'Professional logo design, flyers, social media graphics and brand kits. 2-3 day turnaround.',phone:'+2348023456789',img:null},
];

// ── RENDER ──
function getFiltered() {
  let d = [...listings];
  if (activeCat !== 'all') d = d.filter(l => l.cat === activeCat);
  if (activeSearch) d = d.filter(l =>
    l.title.toLowerCase().includes(activeSearch) ||
    l.cat.toLowerCase().includes(activeSearch) ||
    l.seller.toLowerCase().includes(activeSearch)
  );
  if (sortMode === 'price-asc') d.sort((a,b) => a.price - b.price);
  else if (sortMode === 'price-desc') d.sort((a,b) => b.price - a.price);
  return d;
}

function renderListings() {
  const data = getFiltered();
  const grid = document.getElementById('listingsGrid');
  document.getElementById('listingsCount').textContent = `Showing ${data.length} listing${data.length !== 1 ? 's' : ''}`;
  document.getElementById('stat-count').textContent = listings.length;

  if (!data.length) {
    grid.innerHTML = `<div class="empty">
      <div class="empty-icon"><span class="material-icons-round">search_off</span></div>
      <h3>No listings found</h3><p>Try a different category or search term</p>
    </div>`;
    return;
  }

  grid.innerHTML = data.map((l, i) => {
    const col = COLORS[l.id % COLORS.length];
    const init = (l.seller || '').split(' ').filter(w=>w).map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const isNew = l.condition === 'Brand New';
    const isSvc = l.cat === 'Services';
    const titleSafe = (l.title||'').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const sellerSafe = (l.seller||'').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const imgEl = l.img
      ? `<img src="${l.img}" alt="${titleSafe}">`
      : `<span class="material-icons-round">${CAT_ICONS[l.cat]||'category'}</span>`;
    const wished = wishlist.has(l.id);

    return `<div class="card" style="animation-delay:${((i||0)*0.055)}s" data-listing-id="${l.id}" onclick="openDetail(this.getAttribute('data-listing-id'))">
      <div class="card-img">
        ${imgEl}
        <div class="badge-row">
          <span class="badge ${isSvc?'badge-service':'badge-cat'}">${l.cat}</span>
          ${isNew?'<span class="badge badge-new">New</span>':''}
          <button class="wish-btn ${wished?'liked':''}" id="wish-${l.id}" data-listing-id="${l.id}" onclick="event.stopPropagation(); toggleWish(event, this.getAttribute('data-listing-id'))">
            <span class="material-icons-round">${wished?'favorite':'favorite_border'}</span>
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-cat-label">${l.cat}</div>
        <div class="card-title">${titleSafe}</div>
        <span class="condition-pill">
          <span class="material-icons-round">${COND_ICONS[l.condition]||'info'}</span>${l.condition}
        </span>
        <div class="card-footer">
          <div class="card-price">₦${Number(l.price).toLocaleString()}</div>
          <div class="card-seller">
            <div class="avatar" style="background:${col}">${init}</div>
            ${sellerSafe.split(' ')[0]}
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── FILTER/SORT ──
function filterListings() {
  activeSearch = document.getElementById('searchInput').value.toLowerCase();
  renderListings();
}
function filterCat(cat, el) {
  activeCat = cat;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  renderListings();
}
function sortListings(v) { sortMode = v; renderListings(); }

// ── DETAIL ──
function openDetail(id) {
  try {
    const l = listings.find(x => x.id === id);
    if (!l) return;
    
    const col = COLORS[l.id % COLORS.length];
    const init = (l.seller || '').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const imgEl = l.img
      ? `<img src="${l.img}" alt="Product image" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius)">`
      : `<span class="material-icons-round">${CAT_ICONS[l.cat]||'category'}</span>`;
    
    const waLink = l.phone ? `https://wa.me/${l.phone.replace(/\D/g, '')}?text=Hi, interested in your ${encodeURIComponent(l.title)}` : null;
    const isOwnListing = currentUser && currentUser.uid === l.sellerId;
    
    // Properly escape all user content for HTML
    const titleEsc = (l.title||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const descEsc = (l.desc||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const sellerEsc = (l.seller||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    document.getElementById('detailBody').innerHTML = `
      <div class="detail-img">${imgEl}</div>
      <div class="detail-cat">${l.cat}</div>
      <div class="detail-title">${titleEsc}</div>
      <div class="detail-price">₦${Number(l.price).toLocaleString()}</div>
      <div class="detail-tags">
        <span class="tag"><span class="material-icons-round">location_on</span>On Campus</span>
        <span class="tag"><span class="material-icons-round">${COND_ICONS[l.condition]}</span>${l.condition}</span>
        <span class="tag"><span class="material-icons-round">swap_horiz</span>Negotiable</span>
      </div>
      <div class="detail-desc">${descEsc}</div>
      <div class="seller-card">
        <div class="seller-info">
          <div class="avatar-lg" style="background:${col}">${init}</div>
          <div>
            <div class="seller-name">${sellerEsc}</div>
            <div class="seller-meta" id="sellerVerificationBadge"><span class="material-icons-round">verified</span>Verified student</div>
          </div>
        </div>
      </div>
      
      ${!isOwnListing ? `
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <button class="btn btn-primary" style="flex:1;" data-listing-id="${l.id}" data-seller-id="${l.sellerId}" data-seller-name="${sellerEsc}" onclick="openChatFromButton(this)">
          <span class="material-icons-round" style="font-size:16px">chat</span>Message
        </button>
        ${waLink ? `
        <a href="${waLink}" target="_blank" class="btn btn-outline" style="flex:1; text-decoration:none;">
          <span class="material-icons-round" style="font-size:16px">whatsapp</span>WhatsApp
        </a>
        ` : ''}
      </div>
      ` : `<div style="padding:16px; background:var(--bg2); border-radius:var(--radius-sm); margin-bottom:16px;"><p style="text-align:center; color:var(--ink3); font-size:0.9rem; margin-bottom:12px;">This is your listing</p><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;"><button class="btn btn-primary" onclick="markListingAsSold('${l.id}')" style="flex:1;"><span class="material-icons-round">check_circle</span>Mark Sold</button><button class="btn btn-outline" onclick="editListing('${l.id}')" style="flex:1;"><span class="material-icons-round">edit</span>Edit</button></div></div><div id="transactionSection"></div>`}
      `;
    openOverlay('detailOverlay');
  } catch (err) {
    console.error('Error opening detail:', err);
    showToast('error', 'Failed to load listing details');
  }
}

// ── POST ──
function handleImg(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  // Validate file size (5MB = 5242880 bytes)
  if (file.size > 5242880) {
    showToast('warning', 'Image is too large, nawa for you o (max 5MB)');
    return;
  }
  
  // Validate file type
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    showToast('warning', 'Please upload JPG, PNG, or WebP');
    return;
  }
  
  try {
    // Store file for upload during listing creation
    pendingImg = file;
    const reader = new FileReader();
    reader.onload = ev => {
      // Show preview
      document.getElementById('uploadZone').style.display = 'none';
      document.getElementById('imagePreview').style.display = 'block';
      document.getElementById('previewImg').src = ev.target.result;
      showToast('check_circle', 'Sharp Joor!');
    };
    reader.readAsDataURL(file);
  } catch (error) {
    console.error('Image selection error:', error);
    showToast('error', 'Failed to select image');
  }
}

function removeImage(e) {
  e.preventDefault();
  pendingImg = null;
  document.getElementById('fileInput').value = '';
  document.getElementById('uploadZone').style.display = 'block';
  document.getElementById('imagePreview').style.display = 'none';
  showToast('check_circle', 'Photo removed');
}

function postListing() {
  if (!currentUser) {
    showToast('warning', 'Please sign in to post a listing');
    closeOverlay('postOverlay');
    openOverlay('loginOverlay');
    return;
  }

  const title  = document.getElementById('newTitle').value.trim();
  const price  = document.getElementById('newPrice').value;
  const cat    = document.getElementById('newCat').value;
  const cond   = document.getElementById('newCondition').value;
  const desc   = document.getElementById('newDesc').value.trim();
  const seller = document.getElementById('newSeller').value.trim();
  const phone  = document.getElementById('newPhone').value.trim();

  if (!title || !price || !seller) { showToast('warning','Please fill in all required fields'); return; }
  
  if (!pendingImg) { showToast('warning','Please add a photo to your listing'); return; }

  showToast('info', 'Uploading image...');
  
  (async () => {
    try {
      let imgUrl = null;
      
      // Upload image to Firebase Storage
      if (pendingImg instanceof File) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const fileName = `listings/${currentUser.uid}/${timestamp}_${random}.jpg`;
        const uploadTask = storage.ref(fileName).put(pendingImg);
        
        await new Promise((resolve, reject) => {
          uploadTask.on('state_changed', 
            () => {}, 
            err => reject(err),
            async () => {
              imgUrl = await uploadTask.snapshot.ref.getDownloadURL();
              resolve();
            }
          );
        });
      }
      
      // Save listing to Firestore with storage URL
      const docRef = await db.collection('listings').add({
        title: title,
        price: parseInt(price),
        cat: cat,
        seller: seller,
        sellerId: currentUser.uid,
        condition: cond,
        desc: desc || 'No description provided.',
        phone: phone || null,
        img: imgUrl,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        views: 0,
        sold: false,
        paid: false,
        received: false
      });
      
      // Clear form
      pendingImg = null;
      ['newTitle','newPrice','newDesc','newSeller','newPhone'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('newCondition').value = 'Brand New';
      document.getElementById('fileInput').value = '';
      document.getElementById('uploadZone').style.display = 'block';
      document.getElementById('imagePreview').style.display = 'none';

      closeOverlay('postOverlay');
      showToast('check_circle','Your listing is live!');
    } catch (error) {
      console.error('Post listing error:', error);
      if (error.code === 'permission-denied') {
        showToast('error', 'Listing blocked: Firestore rules not set. Check Firebase Console.');
      } else {
        showToast('error', 'Failed to post listing: ' + error.message);
      }
    }
  })();
}

// ── WISHLIST ──
function toggleWish(e, id) {
  e.stopPropagation();
  const btn = document.getElementById(`wish-${id}`);
  const icon = btn.querySelector('.material-icons-round');
  if (wishlist.has(id)) {
    wishlist.delete(id); icon.textContent = 'favorite_border'; btn.classList.remove('liked');
    showToast('favorite_border','Removed from saved');
  } else {
    wishlist.add(id); icon.textContent = 'favorite'; btn.classList.add('liked');
    showToast('favorite','Saved to wishlist');
  }
}

// ── MESSAGING ──
let currentChatId = null;
let messagesUnsubscribe = null;

async function loadAndShowMessages() {
  if (!currentUser) {
    showToast('warning', 'Please sign in to view messages');
    openOverlay('loginOverlay');
    return;
  }
  
  const container = document.getElementById('messagesListContainer');
  container.innerHTML = '<p style="color:var(--ink3); text-align:center; padding:20px;">Loading conversations...</p>';
  
  try {
    // Query conversations where user is a participant
    const querySnapshot = await db.collection('conversations')
      .where('participants', 'array-contains', currentUser.uid)
      .orderBy('lastMessageTime', 'desc')
      .get();
    
    if (querySnapshot.empty) {
      container.innerHTML = `
        <div style="text-align:center; padding:40px 20px; color:var(--ink3);">
          <div style="font-size:3rem; margin-bottom:12px;">💬</div>
          <p>You have no messages yet</p>
          <p style="font-size:0.85rem; margin-top:8px;">Start a conversation by messaging a seller</p>
        </div>
      `;
    } else {
      const conversationsHtml = querySnapshot.docs.map(doc => {
        const conv = doc.data();
        const otherUserId = conv.participants.find(pid => pid !== currentUser.uid);
        const time = conv.lastMessageTime ? new Date(conv.lastMessageTime.toDate()).toLocaleString() : '';
        const preview = (conv.lastMessage || 'No messages yet').substring(0, 50) + 
                       (conv.lastMessage && conv.lastMessage.length > 50 ? '...' : '');
        
        return `
          <div style="
            padding:12px; background:var(--surface); border-radius:var(--radius-sm);
            border:1px solid var(--border); cursor:pointer; transition:all 0.2s;
          " onclick="openChatFromConversation('${doc.id}', '${otherUserId}', '${conv.sellerName || 'User'}')">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
              <div style="font-weight:500; color:var(--ink);">${conv.sellerName || 'User'}</div>
              <div style="font-size:0.75rem; color:var(--ink3);">${time}</div>
            </div>
            <div style="font-size:0.9rem; color:var(--ink2);">${preview}</div>
          </div>
        `;
      }).join('');
      
      container.innerHTML = conversationsHtml;
    }
    
    openOverlay('messagesOverlay');
  } catch (error) {
    console.error('Load conversations error:', error);
    container.innerHTML = `<p style="color:var(--accent); text-align:center; padding:20px;">Error loading messages: ${error.message}</p>`;
  }
}

function openChatFromConversation(chatId, otherUserId, sellerName) {
  currentChatId = chatId;
  document.getElementById('chatTitle').textContent = `Chat with ${sellerName || 'User'}`;
  loadMessages(currentChatId);
  closeOverlay('messagesOverlay');
  openOverlay('chatOverlay');
}

// ── NOTIFICATIONS ──
let notificationsUnsubscribe = null;

async function loadNotifications() {
  if (!currentUser) {
    showToast('warning', 'Please sign in to view notifications');
    openOverlay('loginOverlay');
    return;
  }
  
  try {
    // Listen to notifications collection for all users (broadcast)
    if (notificationsUnsubscribe) notificationsUnsubscribe();
    
    notificationsUnsubscribe = db.collection('notifications')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .onSnapshot(querySnapshot => {
        const notifs = querySnapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        }));
        
        // Update badge count
        const unreadCount = notifs.filter(n => !n.read).length;
        const badge = document.getElementById('notifBadge');
        if (badge) {
          badge.textContent = unreadCount;
          badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        
        // Display notifications
        showNotificationsList(notifs);
      }, error => {
        console.error('Notifications listener error:', error);
        showToast('error', 'Could not load notifications: ' + error.message);
      });
  } catch (error) {
    console.error('Load notifications error:', error);
    showToast('error', 'Failed to load notifications');
  }
}

function showNotificationsList(notifs) {
  const container = document.getElementById('notificationsContainer');
  if (!container) {
    // Create container if it doesn't exist
    const overlay = document.getElementById('notificationsOverlay');
    if (!overlay) return;
    const modal = overlay.querySelector('.modal');
    if (!modal) return;
    const body = modal.querySelector('.modal-body');
    if (!body) return;
    const div = document.createElement('div');
    div.id = 'notificationsContainer';
    body.appendChild(div);
  }
  
  if (notifs.length === 0) {
    document.getElementById('notificationsContainer').innerHTML = `
      <div style="text-align:center; padding:40px 20px; color:var(--ink3);">
        <div style="font-size:3rem; margin-bottom:12px;">🔔</div>
        <p>No notifications yet</p>
      </div>
    `;
    return;
  }
  
  document.getElementById('notificationsContainer').innerHTML = notifs.map(notif => `
    <div style="padding:14px; background:var(--surface); border-radius:var(--radius-sm); border:1px solid var(--border); margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <div style="font-weight:500; color:var(--ink);">${notif.title || 'Notification'}</div>
        <div style="font-size:0.75rem; color:var(--ink3);">${notif.createdAt ? new Date(notif.createdAt.toDate()).toLocaleString() : ''}</div>
      </div>
      <div style="font-size:0.9rem; color:var(--ink2);">${notif.message || ''}</div>
    </div>
  `).join('');
}

function generateConversationId(userId1, userId2) {
  return [userId1, userId2].sort().join('_');
}

async function openChat(listingId, sellerId, sellerName) {
  try {
    if (!currentUser) {
      showToast('warning', 'Please sign in to chat');
      closeOverlay('detailOverlay');
      openOverlay('loginOverlay');
      return;
    }
    
    if (currentUser.uid === sellerId) {
      showToast('warning', 'Cannot message yourself');
      return;
    }
    
    currentChatId = generateConversationId(currentUser.uid, sellerId);
    document.getElementById('chatTitle').textContent = `Chat with ${sellerName || 'Seller'}`;
    
    // Create/update conversation metadata
    await db.collection('conversations').doc(currentChatId).set({
      participants: [currentUser.uid, sellerId],
      listingId: listingId,
      lastMessage: '',
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp(),
      sellerName: sellerName
    }, { merge: true });
    
    // Load and listen to messages
    loadMessages(currentChatId);
    
    // Open chat overlay
    openOverlay('chatOverlay');
  } catch (error) {
    console.error('OpenChat error:', error);
    if (error.code === 'permission-denied') {
      showToast('error', 'Chat permission denied. Set Firestore rules in Firebase Console.');
    } else {
      showToast('error', 'Chat error: ' + error.message);
    }
  }
}

// Wrapper to safely call openChat from onclick
function openChatUI(listingId, sellerId, sellerName) {
  openChat(listingId, sellerId, sellerName).catch(err => {
    console.error('Chat error:', err);
    showToast('error', 'Failed to open chat');
  });
}

// Wrapper to read data attributes and call openChat
function openChatFromButton(btn) {
  const listingId = btn.getAttribute('data-listing-id');
  const sellerId = btn.getAttribute('data-seller-id');
  const sellerName = btn.getAttribute('data-seller-name');
  openChat(listingId, sellerId, sellerName).catch(err => {
    console.error('Chat error:', err);
    showToast('error', 'Failed to open chat');
  });
}

function loadMessages(chatId) {
  if (messagesUnsubscribe) messagesUnsubscribe();
  
  try {
    messagesUnsubscribe = db.collection('conversations').doc(chatId)
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .onSnapshot(querySnapshot => {
        renderMessages(querySnapshot.docs);
      }, error => {
        console.error('Message listener error:', error);
        showToast('error', 'Could not load messages: ' + error.message);
      });
  } catch (err) {
    console.error('Error setting up message listener:', err);
    showToast('error', 'Chat setup failed');
  }
}

function renderMessages(docs) {
  const messagesEl = document.getElementById('messagesContainer');
  if (!messagesEl) return;
  
  messagesEl.innerHTML = docs.map(doc => {
    try {
      const msg = doc.data();
      const isMine = msg.senderId === currentUser.uid;
      const senderName = isMine ? 'You' : 'Them';
      const time = msg.createdAt ? new Date(msg.createdAt.toDate()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
      const textContent = (msg.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const bgColor = isMine ? 'var(--accent)' : 'var(--bg2)';
      const textColor = isMine ? 'white' : 'var(--ink)';
      const justify = isMine ? 'flex-end' : 'flex-start';
      const timeColor = isMine ? 'rgba(255,255,255,0.7)' : 'var(--ink3)';
      
      return `<div style="display:flex; justify-content:${justify}; margin-bottom:12px;">
        <div style="max-width:70%; background:${bgColor}; color:${textColor}; padding:10px 14px; border-radius:12px; word-wrap:break-word;">
          <div style="font-size:0.75rem; color:${timeColor}; margin-bottom:3px;">${senderName} • ${time}</div>
          <div>${textContent}</div>
        </div>
      </div>`;
    } catch (err) {
      console.error('Error rendering message:', err);
      return '';
    }
  }).join('');
  
  // Scroll to bottom
  setTimeout(() => messagesEl.scrollTop = messagesEl.scrollHeight, 100);
}

async function sendMessage() {
  if (!currentChatId || !currentUser) return;
  
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  
  if (!text) {
    showToast('warning', 'Cannot send empty message');
    return;
  }
  
  try {
    await db.collection('conversations').doc(currentChatId)
      .collection('messages').add({
        senderId: currentUser.uid,
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    
    // Update conversation lastMessage
    await db.collection('conversations').doc(currentChatId).update({
      lastMessage: text,
      lastMessageTime: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    input.value = '';
  } catch (error) {
    console.error('Send message error:', error);
    if (error.code === 'permission-denied') {
      showToast('error', 'Chat blocked: Firestore rules not set. Check Firebase Console.');
    } else {
      showToast('error', 'Failed to send message: ' + (error.message || 'unknown error'));
    }
  }
}

// Seller Verification Functions
async function loadSellerVerification(sellerId) {
  try {
    const userDoc = await db.collection('users').doc(sellerId).get();
    const verificationBadge = document.getElementById('sellerVerificationBadge');
    if (verificationBadge) {
      if (userDoc.exists && userDoc.data().verifiedSeller) {
        verificationBadge.innerHTML = '<span class="material-icons-round" style="color:#2a6b3d;">verified</span>Verified student';
      } else {
        verificationBadge.innerHTML = '<span class="material-icons-round" style="color:var(--ink3);">person</span>Student';
      }
    }
  } catch (error) {
    console.error('Error loading seller verification:', error);
  }
}

// Transaction Functions
async function markListingAsSold(listingId) {
  try {
    const listing = listings.find(x => x.id === listingId);
    if (!listing || listing.sellerId !== currentUser.uid) { showToast('warning', 'Cannot modify this listing'); return; }
    await db.collection('listings').doc(listingId).update({ sold: true, soldAt: firebase.firestore.FieldValue.serverTimestamp() });
    closeOverlay('detailOverlay');
    showToast('check_circle', 'Listing marked as sold!');
  } catch (error) {
    showToast('error', 'Failed to mark as sold: ' + error.message);
  }
}

async function markAsPaid(listingId) {
  try {
    const listing = listings.find(x => x.id === listingId);
    if (!listing) { showToast('warning', 'Listing not found'); return; }
    await db.collection('listings').doc(listingId).update({ paid: true, paidAt: firebase.firestore.FieldValue.serverTimestamp(), paidBy: currentUser.uid });
    showToast('check_circle', 'Payment marked! Seller will confirm receipt.');
    showTransactionUI(listingId);
  } catch (error) {
    showToast('error', 'Failed to mark payment: ' + error.message);
  }
}

function showTransactionUI(listingId) {
  const listing = listings.find(x => x.id === listingId);
  if (!listing || !currentUser) return;
  const isOwnListing = currentUser.uid === listing.sellerId;
  const transSection = document.getElementById('transactionSection');
  if (!transSection) return;
  if (isOwnListing && listing.paid && !listing.received) {
    transSection.style.display = 'block';
    transSection.innerHTML = `<button class="btn btn-primary" onclick="confirmReceived('${listingId}')" style="width:100%;"><span class="material-icons-round">done_all</span>Confirm item received</button>`;
  }
}

async function confirmReceived(listingId) {
  try {
    const listing = listings.find(x => x.id === listingId);
    if (!listing || listing.sellerId !== currentUser.uid) { showToast('warning', 'Cannot confirm'); return; }
    await db.collection('listings').doc(listingId).update({ received: true, receivedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast('check_circle', 'Transaction complete!');
  } catch (error) {
    showToast('error', 'Failed: ' + error.message);
  }
}

function editListing(listingId) {
  showToast('info', 'Edit feature coming soon');
}

// INIT
loadAllListings();

// Monitor auth state changes
firebase.auth().onAuthStateChanged(user => {
  currentUser = user;
  updateAuthUI();
  if (user) {
    loadUserListings();
  }
});