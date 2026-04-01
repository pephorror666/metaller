let currentUser = null;
let currentRole = null;
let currentAlbums = [];
let currentGigs = [];
let activeFilter = { type: null, value: null };
let currentSort = 'default';
let currentView = 'feed';

document.addEventListener('DOMContentLoaded', async () => {
    loadTheme();
    await checkAuth();
});

function loadTheme() {
    const theme = localStorage.getItem('metaller_theme') || 'dark';
    document.body.setAttribute('data-theme', theme);
    document.getElementById('theme-select').value = theme;
}

document.getElementById('theme-select').addEventListener('change', (e) => {
    document.body.setAttribute('data-theme', e.target.value);
    localStorage.setItem('metaller_theme', e.target.value);
});

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
            const data = await res.json();
            currentUser = data.username;
            currentRole = data.role;
            document.getElementById('modal-login').classList.add('hidden');
            if(currentRole === 'admin') document.getElementById('nav-admin').style.display = 'block';
            navigate('feed');
        } else {
            document.getElementById('modal-login').classList.remove('hidden');
        }
    } catch(e) { console.error(e); }
}

document.getElementById('form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    const res = await fetch('/api/auth/login', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({username: user, password: pass})
    });
    if (res.ok) await checkAuth();
    else alert("Invalid credentials. Only real Metalheads allowed.");
});

function logout() {
    fetch('/api/auth/logout', {method: 'POST'}).then(() => location.reload());
}

// --- NAVIGATION & FAB ---
function navigate(view) {
    currentView = view;
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${view}`).style.display = 'block';
    document.getElementById(`nav-${view}`).classList.add('active');
    
    const fab = document.getElementById('fab-btn');
    if(view === 'feed' || view === 'gigs') fab.style.display = 'block';
    else fab.style.display = 'none';
    
    document.getElementById('inline-post-form').classList.add('hidden');
    document.getElementById('inline-gig-form').classList.add('hidden');
    
    // --- ESTAS LÍNEAS CONTROLAN QUÉ SE CARGA ---
    if(view === 'feed') loadAlbums();
    if(view === 'gigs') loadGigs();
    if(view === 'profile') loadProfile(); // <--- AÑADE ESTA LÍNEA AQUÍ
}

function handleFabClick() {
    if(currentView === 'feed') toggleInlineForm('inline-post-form');
    if(currentView === 'gigs') toggleInlineForm('inline-gig-form');
}

function toggleInlineForm(id) {
    const el = document.getElementById(id);
    el.classList.toggle('hidden');
}

// --- TAG FILTERING ---
function setFilter(type, value) {
    activeFilter = { type: type, value: value };
    document.getElementById('active-tag-banner').classList.remove('hidden');
    document.getElementById('active-tag-text').textContent = type === 'tag' ? `#${value}` : `Year: ${value}`;
    renderAlbums();
}

function clearFilter() {
    activeFilter = { type: null, value: null };
    document.getElementById('active-tag-banner').classList.add('hidden');
    renderAlbums();
}

function setSort(sortType) {
    currentSort = sortType;
    renderAlbums();
}

// --- RECORDS (ALBUMS) ---
async function loadAlbums() {
    const res = await fetch('/api/albums');
    currentAlbums = await res.json();
    renderAlbums();
}

function renderAlbums() {
    const container = document.getElementById('feed-container');
    container.innerHTML = '';
    
    // 1. Clonar array para no alterar los datos originales al ordenar
    let toRender = [...currentAlbums];
    
    // 2. Aplicar Filtros (Tag o Año)
    if(activeFilter.type === 'tag') {
        toRender = toRender.filter(a => a.tags.some(t => t.toLowerCase() === activeFilter.value.toLowerCase()));
    } else if(activeFilter.type === 'year') {
        toRender = toRender.filter(a => a.year === activeFilter.value);
    }
    
    // 3. Aplicar Ordenado (Sort)
    if(currentSort === 'year_asc') {
        toRender.sort((a,b) => parseInt(a.year || 0) - parseInt(b.year || 0));
    } else if(currentSort === 'year_desc') {
        toRender.sort((a,b) => parseInt(b.year || 0) - parseInt(a.year || 0));
    } else if(currentSort === 'likes') {
        toRender.sort((a,b) => b.likes.length - a.likes.length);
    } else if(currentSort === 'random') {
        toRender.sort(() => Math.random() - 0.5);
    } else {
        toRender.sort((a,b) => b.id - a.id); // Timeline por defecto
    }
    
    // 4. Renderizar
    toRender.forEach(album => {
        const div = document.createElement('div');
        div.className = 'album-card';
        div.id = `album-${album.id}`;
        
        const isLiked = album.likes.includes(currentUser);
        // Ahora puedes editar si eres el creador OR si eres co-autor
        const canEdit = currentRole === 'admin' || album.author === currentUser || (album.co_authors && album.co_authors.includes(currentUser));
        
        // Formato para los Tags y Links
        let tagsHTML = album.tags.map(t => `<span class="tag" onclick="setFilter('tag', '${t}')">#${t}</span>`).join('');
        let linksHTML = Object.entries(album.links).map(([plat, url]) => `<a href="${url}" target="_blank">${plat}</a>`).join('');

        // Formato Año (Clickable)
        const yearHtml = album.year && album.year !== 'Unknown' 
            ? ` <span style="cursor:pointer; color:var(--primary-color);" onclick="setFilter('year', '${album.year}')">[${album.year}]</span>` 
            : '';

        // Formato Co-autores
        const coAuthorsText = album.co_authors && album.co_authors.length > 0 
            ? `, edited by @${album.co_authors.join(', @')}` 
            : '';

        div.innerHTML = `
            <img src="${album.cover_url || 'https://via.placeholder.com/100/333/666?text=No+Cover'}" class="album-cover">
            <div class="album-content">
                <div class="album-header">${album.artist} - ${album.album}${yearHtml}</div>
                <div class="album-meta" style="font-size:12px;">Posted by @${album.author}${coAuthorsText}</div>
                <div class="album-links">${linksHTML}</div>
                <div class="tags-container">${tagsHTML}</div>
                <div class="actions">
                    <button class="action-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike(${album.id}, this)">🤘 <span>${album.likes.length}</span></button>
                    ${canEdit ? `<button class="action-btn" onclick="enableEditRecord(${album.id})">✏️ Edit</button>
                                 <button class="action-btn delete" onclick="deleteAlbum(${album.id})">🗑️</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// Auto-Extract
document.getElementById('btn-extract').addEventListener('click', async () => {
    const url = document.getElementById('post-url').value;
    if(!url) return alert("Paste a URL first.");
    
    document.getElementById('btn-extract').textContent = "Extracting...";
    const res = await fetch('/api/albums/extract', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({url})
    });
    const data = await res.json();
    document.getElementById('btn-extract').textContent = "Auto-Extract";
    
    if(data.error) alert(data.error);
    else {
        document.getElementById('post-artist').value = data.artist || "";
        document.getElementById('post-album').value = data.album || "";
        document.getElementById('post-year').value = data.year && data.year !== "Unknown" ? data.year : "";
        document.getElementById('post-cover').value = data.cover_url || "";
        // Fill first dynamic link
        const firstLinkInput = document.querySelector('.dynamic-link-input');
        firstLinkInput.value = `${data.platform} | ${data.url}`;
    }
});

// Post Record
document.getElementById('form-post').addEventListener('submit', async (e) => {
    e.preventDefault();
    const links = {};
    document.querySelectorAll('.dynamic-link-input').forEach(input => {
        if(input.value.includes('|')) {
            const parts = input.value.split('|');
            links[parts[0].trim()] = parts[1].trim();
        }
    });
    if(Object.keys(links).length === 0) return alert("Add at least one link formatted as 'Platform | URL'");
    
    const tagsRaw = document.getElementById('post-tags').value;
    const tags = tagsRaw.split(',').map(t => t.trim().replace('#','')).filter(t => t);
    
    const payload = {
        artist: document.getElementById('post-artist').value, album: document.getElementById('post-album').value, year: document.getElementById('post-year').value,
        cover_url: document.getElementById('post-cover').value, tags: tags, links: links
    };
    
    const res = await fetch('/api/albums', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    if(res.ok) {
        toggleInlineForm('inline-post-form');
        document.getElementById('form-post').reset();
        loadAlbums();
    } else {
        // AQUÍ ESTÁ EL TRUCO: capturar el error 403 o cualquier otro
        const errorData = await response.json();
        alert("Huston, tenemos un problema: " + (errorData.error || "Error desconocido"));
        // No cerramos el modal para que el usuario no pierda lo que escribió
    }
});

// Inline Editing Record
function enableEditRecord(id) {
    const album = currentAlbums.find(a => a.id === id);
    const card = document.getElementById(`album-${id}`);
    
    let linksText = Object.entries(album.links).map(([k,v]) => `${k}|${v}`).join(', ');
    
    card.innerHTML = `
        <div style="width:100%;">
            <input type="text" id="edit-artist-${id}" class="edit-input" value="${album.artist}" placeholder="Band">
            <input type="text" id="edit-album-${id}" class="edit-input" value="${album.album}" placeholder="Album">
            <input type="text" id="edit-year-${id}" class="edit-input" value="${album.year}" placeholder="Year">
            <input type="text" id="edit-cover-${id}" class="edit-input" value="${album.cover_url}" placeholder="Cover URL">
            <input type="text" id="edit-links-${id}" class="edit-input" value="${linksText}" placeholder="Links (Platform|URL, Platform2|URL2)">
            <input type="text" id="edit-tags-${id}" class="edit-input" value="${album.tags.join(', ')}" placeholder="Tags">
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="btn btn-secondary" onclick="renderAlbums()">Cancel</button>
                <button class="btn btn-primary" onclick="saveEditRecord(${id})">Save Update</button>
            </div>
        </div>
    `;
}

async function saveEditRecord(id) {
    const linksRaw = document.getElementById(`edit-links-${id}`).value.split(',');
    const links = {};
    linksRaw.forEach(l => {
        if(l.includes('|')) { const p = l.split('|'); links[p[0].trim()] = p[1].trim(); }
    });
    const tags = document.getElementById(`edit-tags-${id}`).value.split(',').map(t=>t.trim()).filter(t=>t);
    
    const payload = {
        artist: document.getElementById(`edit-artist-${id}`).value,
        album: document.getElementById(`edit-album-${id}`).value,
        year: document.getElementById(`edit-year-${id}`).value,
        cover_url: document.getElementById(`edit-cover-${id}`).value,
        links: links, tags: tags
    };
    const res = await fetch(`/api/albums/${id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    if(res.ok) loadAlbums();
}

async function toggleLike(id, btn) {
    const res = await fetch(`/api/albums/${id}/like`, {method: 'POST'});
    if(res.ok) {
        const data = await res.json();
        const span = btn.querySelector('span');
        span.textContent = data.likes.length;
        btn.classList.toggle('liked');
        
        // Update cache
        const album = currentAlbums.find(a => a.id === id);
        album.likes = data.likes;
    }
}

async function deleteAlbum(id) {
    if(!confirm("Erase this record from the vault?")) return;
    const res = await fetch(`/api/albums/${id}`, {method: 'DELETE'});
    if(res.ok) loadAlbums();
}

// --- GIGS ---
async function loadGigs() {
    const res = await fetch('/api/gigs');
    currentGigs = await res.json();
    renderGigs();
}

function renderGigs() {
    const container = document.getElementById('gigs-container');
    container.innerHTML = '';
    
    currentGigs.forEach(c => {
        const div = document.createElement('div');
        div.className = 'album-card';
        div.id = `gig-${c.id}`;
        const canEdit = currentRole === 'admin' || c.author === currentUser;
        const dateStr = c.end_date ? `From ${c.date} to ${c.end_date}` : c.date;

        div.innerHTML = `
            <div style="font-size: 30px; margin-right: 20px; display:flex; align-items:center;">${c.type === 'Festival' ? '🎪' : '🎸'}</div>
            <div class="album-content">
                <div class="album-header" style="color:var(--primary-color)">${c.bands}</div>
                <div class="album-meta">📅 ${dateStr} | 📍 ${c.venue} (${c.city}, ${c.country})</div>
                ${c.extra_info ? `<div style="font-size: 13px; font-style: italic; margin-bottom:10px;">${c.extra_info}</div>` : ''}
                <div class="album-links">${c.ticket_url ? `<a href="${c.ticket_url}" target="_blank">🎟️ TICKETS / INFO</a>` : ''}</div>
                <div class="actions">
                    <span style="font-size: 12px; color: var(--text-muted);">Posted by @${c.author}</span>
                    ${canEdit ? `<button class="action-btn" onclick="enableEditGig(${c.id})">✏️ Edit</button>
                                 <button class="action-btn delete" onclick="deleteGig(${c.id})">🗑️</button>` : ''}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

document.getElementById('form-gig').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        type: document.getElementById('c-type').value, bands: document.getElementById('c-bands').value,
        date: document.getElementById('c-date').value, end_date: document.getElementById('c-end-date').value,
        venue: document.getElementById('c-venue').value, city: document.getElementById('c-city').value,
        country: document.getElementById('c-country').value, ticket_url: document.getElementById('c-tickets').value,
        extra_info: document.getElementById('c-info').value
    };
    const res = await fetch('/api/gigs', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    if(res.ok) { toggleInlineForm('inline-gig-form'); document.getElementById('form-gig').reset(); loadGigs(); }
});

function enableEditGig(id) {
    const gig = currentGigs.find(g => g.id === id);
    const card = document.getElementById(`gig-${id}`);
    
    card.innerHTML = `
        <div style="width:100%;">
            <input type="text" id="edit-gbands-${id}" class="edit-input" value="${gig.bands}">
            <input type="date" id="edit-gdate-${id}" class="edit-input" value="${gig.date}">
            <input type="date" id="edit-gend-${id}" class="edit-input" value="${gig.end_date}">
            <input type="text" id="edit-gvenue-${id}" class="edit-input" value="${gig.venue}">
            <input type="text" id="edit-gcity-${id}" class="edit-input" value="${gig.city}">
            <input type="text" id="edit-gtickets-${id}" class="edit-input" value="${gig.ticket_url}" placeholder="Ticket URL">
            <div style="display:flex; gap:10px; margin-top:10px;">
                <button class="btn btn-secondary" onclick="renderGigs()">Cancel</button>
                <button class="btn btn-primary" onclick="saveEditGig(${id})">Save Update</button>
            </div>
        </div>
    `;
}

async function saveEditGig(id) {
    const payload = {
        bands: document.getElementById(`edit-gbands-${id}`).value,
        date: document.getElementById(`edit-gdate-${id}`).value, end_date: document.getElementById(`edit-gend-${id}`).value,
        venue: document.getElementById(`edit-gvenue-${id}`).value, city: document.getElementById(`edit-gcity-${id}`).value,
        ticket_url: document.getElementById(`edit-gtickets-${id}`).value
    };
    const res = await fetch(`/api/gigs/${id}`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    });
    if(res.ok) loadGigs();
}

async function deleteGig(id) {
    if(!confirm("Erase this gig?")) return;
    const res = await fetch(`/api/gigs/${id}`, {method: 'DELETE'});
    if(res.ok) loadGigs();
}

// --- ADMIN ---
async function importDB() {
    const fileInput = document.getElementById('import-file');
    if(fileInput.files.length === 0) return alert("Select a JSON file first.");
    
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    
    const res = await fetch('/api/admin/import', { method: 'POST', body: formData });
    const data = await res.json();
    
    if(res.ok) { alert("Database restored successfully!"); navigate('feed'); }
    else alert("Error: " + data.error);
}

// --- PROFILE LOGIC ---
async function loadProfile() {
    // Si aún no tenemos el usuario, intentamos obtenerlo de nuevo
    if (!currentUser) {
        const resMe = await fetch('/api/auth/me');
        if (resMe.ok) {
            const dataMe = await resMe.json();
            currentUser = dataMe.username;
        } else {
            return; // No cargamos si no hay usuario
        }
    }

    // Ahora sí, cargamos los datos frescos
    const resA = await fetch('/api/albums');
    const albums = await resA.json(); // Usamos una variable local para evitar conflictos
    const resG = await fetch('/api/gigs');
    const gigs = await resG.json();
    
    // Filtramos
    const myAlbums = albums.filter(a => a.author === currentUser || (a.co_authors && a.co_authors.includes(currentUser)));
    const likedAlbums = albums.filter(a => a.likes.includes(currentUser));
    const myGigs = gigs.filter(g => g.author === currentUser);
    
    // Actualizamos contadores
    document.getElementById('stat-records').textContent = myAlbums.length;
    document.getElementById('stat-likes').textContent = likedAlbums.length;
    document.getElementById('stat-gigs').textContent = myGigs.length;
    
    // Renderizamos
    renderProfileAlbums(myAlbums, 'profile-records-container');
    renderProfileAlbums(likedAlbums, 'profile-likes-container');
    renderProfileGigs(myGigs, 'profile-gigs-container');
}

function renderProfileAlbums(albumsArray, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if(albumsArray.length === 0) {
        container.innerHTML = '<p style="padding:15px; color:var(--text-muted);">Nothing here yet.</p>';
        return;
    }
    
    albumsArray.forEach(album => {
        const div = document.createElement('div');
        div.className = 'album-card';
        let tagsHTML = album.tags.map(t => `<span class="tag">#${t}</span>`).join('');
        let linksHTML = Object.entries(album.links).map(([plat, url]) => `<a href="${url}" target="_blank">${plat}</a>`).join('');

        // Tarjeta en modo "Solo lectura" para el perfil
        div.innerHTML = `
            <img src="${album.cover_url || 'https://via.placeholder.com/100/333/666?text=No+Cover'}" class="album-cover">
            <div class="album-content">
                <div class="album-header">${album.artist} - ${album.album} ${album.year && album.year !== 'Unknown' ? `[${album.year}]` : ''}</div>
                <div class="album-meta">Posted by @${album.author}</div>
                <div class="album-links">${linksHTML}</div>
                <div class="tags-container">${tagsHTML}</div>
                <div class="actions">
                    <span style="font-size:14px; color:var(--text-muted);">🤘 ${album.likes.length} Likes</span>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderProfileGigs(gigsArray, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if(gigsArray.length === 0) {
        container.innerHTML = '<p style="padding:15px; color:var(--text-muted);">No gigs found.</p>';
        return;
    }
    
    gigsArray.forEach(c => {
        const div = document.createElement('div');
        div.className = 'album-card';
        const dateStr = c.end_date ? `From ${c.date} to ${c.end_date}` : c.date;
        
        div.innerHTML = `
            <div style="font-size: 30px; margin-right: 20px; display:flex; align-items:center;">${c.type === 'Festival' ? '🎪' : '🎸'}</div>
            <div class="album-content">
                <div class="album-header" style="color:var(--primary-color)">${c.bands}</div>
                <div class="album-meta">📅 ${dateStr} | 📍 ${c.venue} (${c.city}, ${c.country})</div>
                <div class="album-links">${c.ticket_url ? `<a href="${c.ticket_url}" target="_blank">🎟️ TICKETS / INFO</a>` : ''}</div>
            </div>
        `;
        container.appendChild(div);
    });
}