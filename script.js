// ==============================================================
// FIREBASE CONFIG
// ==============================================================
const firebaseConfig = {
    apiKey: "AIzaSyBYFY3eNn69NG54PsIvJkOwh2UMeTpJVdU",
    authDomain: "melodify-85954.firebaseapp.com",
    projectId: "melodify-85954",
    storageBucket: "melodify-85954.firebasestorage.app",
    messagingSenderId: "635746561853",
    appId: "1:635746561853:web:fcc711d983cc9332f89f54"
};

import { initializeApp } from 'firebase/app';
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot, increment, Timestamp, getDocs } from 'firebase/firestore';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ADMIN_EMAIL = 'gamingmanojit14@gmail.com';

// ==============================================================
// STATE
// ==============================================================
const state = {
    songs: [],
    currentSong: null,
    currentIndex: -1,
    isPlaying: false,
    isAdmin: false,
    searchTerm: '',
    categoryFilter: 'all',
    categories: new Set(),
    audio: document.getElementById('audioElement'),
    $: (id) => document.getElementById(id),
    playlists: [],
    userId: localStorage.getItem('melodify_user_id') || 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    sortMode: 'recent',
    showFavoritesOnly: false,
    authUser: null,
};
const $ = state.$;
const audio = state.audio;

// ==============================================================
// HELPER FUNCTIONS
// ==============================================================
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function convertToCdnUrl(url) {
    if (!url) return url;
    if (url.includes('cdn.jsdelivr.net/gh/')) return url;
    const rawMatch = url.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/);
    if (rawMatch) {
        const [, username, repo, branch, path] = rawMatch;
        return `https://cdn.jsdelivr.net/gh/${username}/${repo}@${branch}/${path}`;
    }
    return url;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function showToast(message, type = 'info') {
    const container = $('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(30px)';
        toast.style.transition = '0.25s ease';
        setTimeout(() => toast.remove(), 350);
    }, 3200);
}

function generateRandomCounts() {
    let views, likes, downloads;
    do {
        views = Math.floor(Math.random() * 4000) + 1000;
        likes = Math.floor(Math.random() * 4000) + 1000;
        downloads = Math.floor(Math.random() * 4000) + 1000;
    } while (!(views > likes && likes > downloads));
    return { views, likes, downloads };
}

// ==============================================================
// LIKES (localStorage)
// ==============================================================
function getLikedSongs() {
    try { return JSON.parse(localStorage.getItem('melodify_user_likes')) || {}; } catch { return {}; }
}
function saveLikedSongs(likes) { localStorage.setItem('melodify_user_likes', JSON.stringify(likes)); }
function userHasLiked(songId) { return !!getLikedSongs()[songId]; }
function toggleUserLike(songId) {
    const likes = getLikedSongs();
    if (likes[songId]) { delete likes[songId]; saveLikedSongs(likes); return false; }
    else { likes[songId] = true; saveLikedSongs(likes); return true; }
}
function getLikedSongIds() { return Object.keys(getLikedSongs()); }

// ==============================================================
// RECENTLY PLAYED (localStorage)
// ==============================================================
function getRecentlyPlayed() {
    try { return JSON.parse(localStorage.getItem('melodify_recently_played')) || []; } catch { return []; }
}
function saveRecentlyPlayed(recent) { localStorage.setItem('melodify_recently_played', JSON.stringify(recent)); }
function addToRecentlyPlayed(songId) {
    let recent = getRecentlyPlayed();
    recent = recent.filter(id => id !== songId);
    recent.unshift(songId);
    if (recent.length > 20) recent = recent.slice(0, 20);
    saveRecentlyPlayed(recent);
    renderRecentlyPlayed();
}

// ==============================================================
// QUEUE (localStorage)
// ==============================================================
function getQueue() {
    try { return JSON.parse(localStorage.getItem('melodify_queue')) || []; } catch { return []; }
}
function saveQueue(queue) { localStorage.setItem('melodify_queue', JSON.stringify(queue)); }
function addToQueue(songId, position = 'end') {
    let queue = getQueue();
    if (position === 'next') queue.unshift(songId);
    else queue.push(songId);
    saveQueue(queue);
    renderQueue();
    showToast(position === 'next' ? 'Added to queue (next)' : 'Added to queue', 'info');
}
function removeFromQueue(index) {
    let queue = getQueue();
    queue.splice(index, 1);
    saveQueue(queue);
    renderQueue();
}
function getNextFromQueue() {
    const queue = getQueue();
    if (queue.length === 0) return null;
    const nextId = queue[0];
    queue.shift();
    saveQueue(queue);
    renderQueue();
    return nextId;
}

// ==============================================================
// PLAYLISTS (localStorage)
// ==============================================================
function loadPlaylists() {
    try { state.playlists = JSON.parse(localStorage.getItem('melodify_playlists')) || []; } catch { state.playlists = []; }
}
function savePlaylists() { localStorage.setItem('melodify_playlists', JSON.stringify(state.playlists)); }
function getPlaylistById(id) { return state.playlists.find(p => p.id === id); }
function createPlaylist(name) {
    const id = 'pl_' + Date.now();
    const playlist = { id, name: name.trim(), songs: [] };
    state.playlists.push(playlist);
    savePlaylists();
    renderPlaylists();
    showToast(`Playlist "${name}" created.`, 'success');
    return playlist;
}
function deletePlaylist(id) {
    if (!confirm('Delete this playlist?')) return;
    state.playlists = state.playlists.filter(p => p.id !== id);
    savePlaylists();
    renderPlaylists();
    showToast('Playlist deleted.', 'info');
}
function addSongToPlaylist(playlistId, songId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return showToast('Playlist not found.', 'error');
    if (playlist.songs.includes(songId)) return showToast('Song already in playlist.', 'info');
    playlist.songs.push(songId);
    savePlaylists();
    renderPlaylists();
    showToast('Song added to playlist.', 'success');
}
function removeSongFromPlaylist(playlistId, songId) {
    const playlist = getPlaylistById(playlistId);
    if (!playlist) return;
    playlist.songs = playlist.songs.filter(id => id !== songId);
    savePlaylists();
    renderPlaylists();
    showToast('Song removed from playlist.', 'info');
}

// ==============================================================
// PLAY HISTORY (for recommendations)
// ==============================================================
function getPlayHistory() {
    try { return JSON.parse(localStorage.getItem('melodify_play_history')) || {}; } catch { return {}; }
}
function savePlayHistory(history) { localStorage.setItem('melodify_play_history', JSON.stringify(history)); }
function incrementPlayCount(songId) {
    const history = getPlayHistory();
    history[songId] = (history[songId] || 0) + 1;
    savePlayHistory(history);
    return history;
}
function clearPlayHistory() {
    localStorage.removeItem('melodify_play_history');
    renderRecommendations();
    showToast('Listening history cleared.', 'info');
}

// ==============================================================
// VIEW COUNTER (localStorage)
// ==============================================================
function hasViewedSong(songId) {
    try {
        const viewed = JSON.parse(localStorage.getItem('melodify_viewed_songs')) || {};
        return !!viewed[songId];
    } catch { return false; }
}
function markSongViewed(songId) {
    try {
        const viewed = JSON.parse(localStorage.getItem('melodify_viewed_songs')) || {};
        viewed[songId] = true;
        localStorage.setItem('melodify_viewed_songs', JSON.stringify(viewed));
    } catch {}
}

// ==============================================================
// SHUFFLE & REPEAT
// ==============================================================
let shuffleMode = false;
let repeatMode = 'none';
let sleepTimerTimeout = null;

function toggleShuffle() {
    shuffleMode = !shuffleMode;
    document.querySelectorAll('.shuffle-btn').forEach(btn => btn.classList.toggle('shuffle-active'));
    showToast(shuffleMode ? 'Shuffle on' : 'Shuffle off', 'info');
}
function toggleRepeat() {
    if (repeatMode === 'none') repeatMode = 'all';
    else if (repeatMode === 'all') repeatMode = 'one';
    else repeatMode = 'none';
    document.querySelectorAll('.repeat-btn').forEach(btn => {
        btn.classList.remove('repeat-active', 'repeat-one-active');
        if (repeatMode === 'all') btn.classList.add('repeat-active');
        else if (repeatMode === 'one') btn.classList.add('repeat-one-active');
    });
    const labels = { 'none': 'Repeat off', 'all': 'Repeat all', 'one': 'Repeat one' };
    showToast(labels[repeatMode], 'info');
}

// ==============================================================
// RENDER FUNCTIONS
// ==============================================================
function renderRecentlyPlayed() {
    const container = $('recentGrid');
    const empty = $('recentEmpty');
    if (!container) return;
    const recentIds = getRecentlyPlayed();
    if (recentIds.length === 0 || state.songs.length === 0) {
        container.innerHTML = '';
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';
    const recentSongs = recentIds.map(id => state.songs.find(s => s.id === id)).filter(Boolean).slice(0, 20);
    if (recentSongs.length === 0) { container.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    container.innerHTML = recentSongs.map((song) => {
        const isCurrent = state.currentSong && state.currentSong.id === song.id;
        const isPlaying = isCurrent && state.isPlaying;
        const thumbCdn = convertToCdnUrl(song.thumbnailUrl);
        return `<div class="song-card" data-id="${song.id}">
            <div class="thumbnail-wrapper">
                <img class="thumbnail" src="${thumbCdn}" alt="${escapeHtml(song.title)}" loading="lazy"
                    onerror="this.src='https://placehold.co/300x300/181818/333?text=🎵';" />
                <div class="play-overlay-icon"><i class="fas fa-play-circle"></i></div>
            </div>
            <div class="title">${escapeHtml(song.title)}</div>
            <div class="artist">${escapeHtml(song.artist)}</div>
            <div class="card-actions">
                <button class="btn-icon play-btn" data-action="recent-play" data-id="${song.id}">
                    <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="btn-icon queue-btn" data-action="recent-queue" data-id="${song.id}"><i class="fas fa-list"></i></button>
                <button class="btn-icon" data-action="recent-download" data-id="${song.id}"><i class="fas fa-download"></i></button>
            </div>
            <div class="played-time">Recently played</div>
        </div>`;
    }).join('');
    container.querySelectorAll('[data-action="recent-play"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) togglePlaySong(song); });
    });
    container.querySelectorAll('[data-action="recent-queue"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(btn.dataset.id, 'end'); });
    });
    container.querySelectorAll('[data-action="recent-download"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) handleDownload(song); });
    });
    container.querySelectorAll('.song-card').forEach(card => {
        card.addEventListener('click', () => { const song = state.songs.find(s => s.id === card.dataset.id); if (song) playSong(song); });
    });
}

function renderRecommendations() {
    const container = $('recGrid');
    const empty = $('recEmpty');
    const sub = $('recSub');
    if (!container) return;
    const history = getPlayHistory();
    const playedIds = Object.keys(history);
    if (playedIds.length === 0 || state.songs.length === 0) {
        container.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        if (sub) sub.textContent = 'Start listening to get personalised recommendations!';
        return;
    }
    const recs = getRecommendations(state.songs, 6);
    if (recs.length === 0) {
        container.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        if (sub) sub.textContent = 'No recommendations yet. Keep exploring!';
        return;
    }
    if (empty) empty.classList.add('hidden');
    const catTotals = {};
    for (const song of state.songs) {
        const count = history[song.id] || 0;
        if (count > 0) { const cat = song.category || 'Uncategorized'; catTotals[cat] = (catTotals[cat] || 0) + count; }
    }
    let topCat = 'Unknown', maxC = 0;
    for (const [cat, count] of Object.entries(catTotals)) { if (count > maxC) { maxC = count; topCat = cat; } }
    if (sub) sub.textContent = `Based on your love for "${topCat}" — here are some tracks you might enjoy.`;
    container.innerHTML = recs.map((song) => {
        const isCurrent = state.currentSong && state.currentSong.id === song.id;
        const isPlaying = isCurrent && state.isPlaying;
        const thumbCdn = convertToCdnUrl(song.thumbnailUrl);
        const isLiked = userHasLiked(song.id);
        return `<div class="song-card" data-id="${song.id}">
            <div class="thumbnail-wrapper">
                <img class="thumbnail" src="${thumbCdn}" alt="${escapeHtml(song.title)}" loading="lazy"
                    onerror="this.src='https://placehold.co/300x300/181818/333?text=🎵';" />
                <div class="play-overlay-icon"><i class="fas fa-play-circle"></i></div>
            </div>
            <div class="title">${escapeHtml(song.title)}</div>
            <div class="artist">${escapeHtml(song.artist)}</div>
            <span class="category-badge">${escapeHtml(song.category || 'Uncategorized')}</span>
            <div class="card-actions">
                <button class="btn-icon play-btn" data-action="rec-play" data-id="${song.id}">
                    <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="btn-icon like-btn ${isLiked ? 'liked' : ''}" data-action="rec-like" data-id="${song.id}"><i class="fas fa-heart"></i></button>
                <button class="btn-icon queue-btn" data-action="rec-queue" data-id="${song.id}"><i class="fas fa-list"></i></button>
                <button class="btn-icon add-to-playlist" data-action="rec-add" data-id="${song.id}"><i class="fas fa-plus"></i></button>
                <button class="btn-icon" data-action="rec-download" data-id="${song.id}"><i class="fas fa-download"></i></button>
            </div>
            <div class="stats-row"><span><i class="fas fa-heart" style="color:#ef4444;"></i> ${song.likes||0}</span><span><i class="fas fa-eye"></i> ${song.views||0}</span></div>
        </div>`;
    }).join('');
    container.querySelectorAll('[data-action="rec-play"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) togglePlaySong(song); });
    });
    container.querySelectorAll('[data-action="rec-like"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) toggleLike(song.id); });
    });
    container.querySelectorAll('[data-action="rec-queue"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(btn.dataset.id, 'end'); });
    });
    container.querySelectorAll('[data-action="rec-add"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); showAddToPlaylistPopup(btn.dataset.id, btn); });
    });
    container.querySelectorAll('[data-action="rec-download"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) handleDownload(song); });
    });
    container.querySelectorAll('.song-card').forEach(card => {
        card.addEventListener('click', () => { const song = state.songs.find(s => s.id === card.dataset.id); if (song) playSong(song); });
    });
}

function getRecommendations(songs, limit = 6) {
    const history = getPlayHistory();
    const playedIds = Object.keys(history);
    if (playedIds.length === 0) return [];
    const categoryTotals = {};
    for (const song of songs) {
        const count = history[song.id] || 0;
        if (count > 0) { const cat = song.category || 'Uncategorized'; categoryTotals[cat] = (categoryTotals[cat] || 0) + count; }
    }
    let topCategory = null, maxCount = 0;
    for (const [cat, count] of Object.entries(categoryTotals)) { if (count > maxCount) { maxCount = count; topCategory = cat; } }
    if (!topCategory) return [];
    const categorySongs = songs.filter(s => (s.category || 'Uncategorized') === topCategory).sort((a, b) => (b.likes || 0) - (a.likes || 0));
    const unplayedSongs = categorySongs.filter(s => !history[s.id] || history[s.id] === 0);
    const playedSongs = categorySongs.filter(s => history[s.id] && history[s.id] > 0).sort((a, b) => (history[a.id] || 0) - (history[b.id] || 0));
    return [...unplayedSongs, ...playedSongs].slice(0, limit);
}

function renderSongs() {
    const container = $('songGrid');
    const empty = $('emptyState');
    if (!container) return;
    const term = state.searchTerm.toLowerCase().trim();
    const filter = state.categoryFilter;
    let filtered = state.songs.filter(song => {
        const matchSearch = song.title.toLowerCase().includes(term) || song.artist.toLowerCase().includes(term);
        return matchSearch && (filter === 'all' || song.category === filter);
    });
    if (state.showFavoritesOnly) {
        const likedIds = getLikedSongIds();
        filtered = filtered.filter(s => likedIds.includes(s.id));
    }
    const mode = state.sortMode;
    const sorted = [...filtered];
    switch (mode) {
        case 'title': sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
        case 'artist': sorted.sort((a, b) => a.artist.localeCompare(b.artist)); break;
        case 'likes': sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0)); break;
        case 'views': sorted.sort((a, b) => (b.views || 0) - (a.views || 0)); break;
        default: break;
    }
    if (sorted.length === 0) { container.innerHTML = ''; if (empty) empty.classList.remove('hidden'); return; }
    if (empty) empty.classList.add('hidden');
    container.innerHTML = sorted.map((song) => {
        const isCurrent = state.currentSong && state.currentSong.id === song.id;
        const isPlaying = isCurrent && state.isPlaying;
        const thumbCdn = convertToCdnUrl(song.thumbnailUrl);
        const isLiked = userHasLiked(song.id);
        return `<div class="song-card" data-id="${song.id}">
            <div class="thumbnail-wrapper">
                <img class="thumbnail" src="${thumbCdn}" alt="${escapeHtml(song.title)}" loading="lazy"
                    onerror="this.src='https://placehold.co/300x300/181818/333?text=🎵';" />
                <div class="play-overlay-icon"><i class="fas fa-play-circle"></i></div>
            </div>
            <div class="title">${escapeHtml(song.title)}</div>
            <div class="artist">${escapeHtml(song.artist)}</div>
            <span class="category-badge">${escapeHtml(song.category || 'Uncategorized')}</span>
            <div class="card-actions">
                <button class="btn-icon play-btn" data-action="play" data-id="${song.id}">
                    <i class="fas ${isPlaying ? 'fa-pause' : 'fa-play'}"></i>
                </button>
                <button class="btn-icon like-btn ${isLiked ? 'liked' : ''}" data-action="like" data-id="${song.id}"><i class="fas fa-heart"></i></button>
                <button class="btn-icon queue-btn" data-action="queue" data-id="${song.id}"><i class="fas fa-list"></i></button>
                <button class="btn-icon add-to-playlist" data-action="add" data-id="${song.id}"><i class="fas fa-plus"></i></button>
                <button class="btn-icon" data-action="download" data-id="${song.id}"><i class="fas fa-download"></i></button>
            </div>
            <div class="stats-row"><span><i class="fas fa-heart" style="color:#ef4444;"></i> ${song.likes||0}</span><span><i class="fas fa-eye"></i> ${song.views||0}</span></div>
        </div>`;
    }).join('');
    container.querySelectorAll('[data-action="play"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) togglePlaySong(song); });
    });
    container.querySelectorAll('[data-action="like"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) toggleLike(song.id); });
    });
    container.querySelectorAll('[data-action="queue"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); addToQueue(btn.dataset.id, 'end'); });
    });
    container.querySelectorAll('[data-action="add"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); showAddToPlaylistPopup(btn.dataset.id, btn); });
    });
    container.querySelectorAll('[data-action="download"]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); const song = state.songs.find(s => s.id === btn.dataset.id); if (song) handleDownload(song); });
    });
    container.querySelectorAll('.song-card').forEach(card => {
        card.addEventListener('click', () => { const song = state.songs.find(s => s.id === card.dataset.id); if (song) playSong(song); });
    });
}

function renderQueue() {
    const container = $('queueList');
    if (!container) return;
    const queue = getQueue();
    if (queue.length === 0) {
        container.innerHTML = `<div class="queue-empty"><i class="fas fa-music"></i><p>Queue is empty</p></div>`;
        return;
    }
    container.innerHTML = queue.map((songId, index) => {
        const song = state.songs.find(s => s.id === songId);
        if (!song) return '';
        const thumb = convertToCdnUrl(song.thumbnailUrl);
        const isCurrent = state.currentSong && state.currentSong.id === songId;
        return `<div class="queue-item ${isCurrent ? 'current' : ''}" data-id="${song.id}">
            <span class="q-index">${index+1}</span>
            <img class="q-thumb" src="${thumb}" alt="" onerror="this.src='https://placehold.co/100x100/181818/333?text=🎵';" />
            <div class="q-info"><div class="q-title">${escapeHtml(song.title)}</div><div class="q-artist">${escapeHtml(song.artist)}</div></div>
            <button class="q-remove" data-index="${index}"><i class="fas fa-times"></i></button>
        </div>`;
    }).join('');
    container.querySelectorAll('.queue-item').forEach(el => {
        el.addEventListener('click', (e) => { if (e.target.closest('.q-remove')) return; const song = state.songs.find(s => s.id === el.dataset.id); if (song) playSong(song); });
    });
    container.querySelectorAll('.q-remove').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); removeFromQueue(parseInt(btn.dataset.index)); });
    });
}

function renderPlaylists() {
    const list = $('playlistList');
    if (!list) return;
    if (state.playlists.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">No playlists yet.</p>';
        return;
    }
    list.innerHTML = state.playlists.map(pl => {
        const count = pl.songs.length;
        return `<div class="playlist-item" data-id="${pl.id}">
            <div class="pl-info" data-id="${pl.id}"><span class="pl-name">${escapeHtml(pl.name)}</span><span class="pl-count">${count} song${count!==1?'s':''}</span></div>
            <div class="pl-actions">
                <button class="btn-icon view-playlist" data-id="${pl.id}"><i class="fas fa-eye"></i></button>
                <button class="btn-icon delete-playlist" data-id="${pl.id}"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`;
    }).join('');
    list.querySelectorAll('.pl-info, .view-playlist').forEach(el => {
        el.addEventListener('click', () => { showPlaylistDetail(el.dataset.id); });
    });
    list.querySelectorAll('.delete-playlist').forEach(el => {
        el.addEventListener('click', (e) => { e.stopPropagation(); deletePlaylist(el.dataset.id); });
    });
}

function showPlaylistDetail(id) {
    const playlist = getPlaylistById(id);
    if (!playlist) return showToast('Playlist not found.', 'error');
    const detailName = $('detailPlaylistName');
    const detailList = $('detailSongsList');
    const mainView = $('playlistMainView');
    const detailView = $('playlistDetailView');
    if (detailName) detailName.textContent = playlist.name;
    if (detailList) {
        if (playlist.songs.length === 0) { detailList.innerHTML = '<p style="color:var(--text-muted); padding:0.5rem;">No songs in this playlist.</p>'; }
        else {
            detailList.innerHTML = playlist.songs.map(songId => {
                const song = state.songs.find(s => s.id === songId);
                if (!song) return '';
                const thumb = convertToCdnUrl(song.thumbnailUrl);
                return `<div class="detail-song-item" data-id="${song.id}">
                    <img class="ds-thumb" src="${thumb}" alt="" onerror="this.src='https://placehold.co/100x100/181818/333?text=🎵';" />
                    <div class="ds-info"><div class="ds-title">${escapeHtml(song.title)}</div><div class="ds-artist">${escapeHtml(song.artist)}</div></div>
                    <div class="ds-actions">
                        <button class="btn-icon play-song" data-id="${song.id}"><i class="fas fa-play"></i></button>
                        <button class="btn-icon remove-from-playlist" data-playlist="${id}" data-id="${song.id}"><i class="fas fa-times"></i></button>
                    </div>
                </div>`;
            }).join('');
            detailList.querySelectorAll('.play-song').forEach(btn => {
                btn.addEventListener('click', () => { const song = state.songs.find(s => s.id === btn.dataset.id); if (song) playSong(song); });
            });
            detailList.querySelectorAll('.remove-from-playlist').forEach(btn => {
                btn.addEventListener('click', () => { removeSongFromPlaylist(btn.dataset.playlist, btn.dataset.id); showPlaylistDetail(btn.dataset.playlist); });
            });
        }
    }
    if (mainView) mainView.style.display = 'none';
    if (detailView) detailView.classList.add('active');
}

function populateCategoryFilter() {
    const filter = $('categoryFilter');
    if (!filter) return;
    const current = filter.value;
    filter.innerHTML = '<option value="all">All</option>';
    Array.from(state.categories).sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        filter.appendChild(opt);
    });
    if (current && state.categories.has(current)) filter.value = current;
    else filter.value = 'all';
}

// ==============================================================
// LIKE TOGGLE (with Firestore)
// ==============================================================
async function toggleLike(songId) {
    const song = state.songs.find(s => s.id === songId);
    if (!song) return;
    const wasLiked = userHasLiked(songId);
    const nowLiked = toggleUserLike(songId);
    updateLikeUI(songId, nowLiked);
    updateFavCount();
    try {
        const songRef = doc(db, 'songs', songId);
        if (nowLiked) { await updateDoc(songRef, { likes: increment(1) }); song.likes = (song.likes || 0) + 1; }
        else { await updateDoc(songRef, { likes: increment(-1) }); song.likes = Math.max(0, (song.likes || 0) - 1); }
        updateStats(); renderSongs(); renderRecommendations(); renderRecentlyPlayed();
        showToast(nowLiked ? '❤️ Liked!' : '💔 Unliked!', 'success');
    } catch (err) {
        toggleUserLike(songId);
        updateLikeUI(songId, wasLiked);
        updateFavCount();
        showToast('Failed to update like: ' + err.message, 'error');
    }
}
function updateLikeUI(songId, liked) {
    document.querySelectorAll(`[data-id="${songId}"]`).forEach(el => {
        if (el.classList.contains('like-btn') || el.classList.contains('like-btn-player')) {
            if (liked) el.classList.add('liked'); else el.classList.remove('liked');
        }
    });
    const song = state.songs.find(s => s.id === songId);
    if (song) {
        document.querySelectorAll(`.song-card[data-id="${songId}"] .stats-row`).forEach(el => {
            const likeSpan = el.querySelector('span:first-child');
            if (likeSpan) likeSpan.innerHTML = `<i class="fas fa-heart" style="color:#ef4444;"></i> ${song.likes||0}`;
        });
    }
    if (state.currentSong && state.currentSong.id === songId) { updatePlayerLikeButton(); updateExpandedLikeButton(); }
}
function updateFavCount() {
    const count = getLikedSongIds().length;
    const favCount = $('favCount');
    if (favCount) favCount.textContent = count;
    if (state.showFavoritesOnly && count === 0) {
        const toggle = $('favoritesToggle');
        if (toggle) { toggle.classList.remove('active'); state.showFavoritesOnly = false; renderSongs(); }
    }
}

// ==============================================================
// UPDATE STATS (admin)
// ==============================================================
function updateStats() {
    const total = state.songs.length;
    const downloads = state.songs.reduce((sum, s) => sum + (s.downloads || 0), 0);
    const totalLikes = state.songs.reduce((sum, s) => sum + (s.likes || 0), 0);
    const totalViews = state.songs.reduce((sum, s) => sum + (s.views || 0), 0);
    const statSongs = $('statSongs');
    const statDownloads = $('statDownloads');
    const statCategories = $('statCategories');
    const statTotalLikes = $('statTotalLikes');
    const statTotalViews = $('statTotalViews');
    if (statSongs) statSongs.textContent = total;
    if (statDownloads) statDownloads.textContent = downloads;
    if (statCategories) statCategories.textContent = state.categories.size;
    if (statTotalLikes) statTotalLikes.textContent = totalLikes;
    if (statTotalViews) statTotalViews.textContent = totalViews;
}

// ==============================================================
// PLAYER FUNCTIONS
// ==============================================================
function getNextSong() {
    const nextFromQueue = getNextFromQueue();
    if (nextFromQueue) { const nextSong = state.songs.find(s => s.id === nextFromQueue); if (nextSong) return nextSong; }
    if (shuffleMode) {
        const available = state.songs.filter(s => s.id !== state.currentSong?.id);
        if (available.length === 0) return null;
        return available[Math.floor(Math.random() * available.length)];
    }
    if (state.currentIndex === -1) return state.songs[0] || null;
    const nextIdx = (state.currentIndex + 1) % state.songs.length;
    if (nextIdx === state.currentIndex) return null;
    return state.songs[nextIdx] || null;
}

function playSong(song) {
    if (!song || !song.audioUrl) { showToast('Song URL not available.', 'error'); return; }
    const cdnUrl = convertToCdnUrl(song.audioUrl);
    if (state.currentSong && state.currentSong.id === song.id) { togglePlayPause(); return; }
    if (!hasViewedSong(song.id)) {
        markSongViewed(song.id);
        try { updateDoc(doc(db, 'songs', song.id), { views: increment(1) }); } catch {}
    }
    incrementPlayCount(song.id);
    addToRecentlyPlayed(song.id);
    state.currentSong = song;
    state.currentIndex = state.songs.findIndex(s => s.id === song.id);
    audio.src = cdnUrl;
    audio.load();
    audio.play().then(() => {
        state.isPlaying = true;
        updatePlayerUI();
        renderSongs(); renderRecommendations(); renderRecentlyPlayed();
        updatePlayerLikeButton(); updateExpandedLikeButton();
        renderQueue();
        if ($('expandedPlayerOverlay')?.classList.contains('active')) updateExpandedPlayerUI();
    }).catch(() => showToast('Unable to play. Check audio URL.', 'error'));
}

function togglePlaySong(song) {
    if (state.currentSong && state.currentSong.id === song.id) togglePlayPause();
    else playSong(song);
}
function togglePlayPause() {
    if (!state.currentSong) return;
    if (audio.paused) {
        audio.play().then(() => {
            if (state.currentSong) incrementPlayCount(state.currentSong.id);
            state.isPlaying = true;
            updatePlayerUI();
            renderSongs();
            if ($('expandedPlayerOverlay')?.classList.contains('active')) updateExpandedPlayerUI();
        }).catch(() => {});
    } else { audio.pause(); state.isPlaying = false; updatePlayerUI(); renderSongs(); if ($('expandedPlayerOverlay')?.classList.contains('active')) updateExpandedPlayerUI(); }
}
function resetPlayer() {
    audio.pause(); audio.src = ''; state.isPlaying = false; state.currentSong = null; state.currentIndex = -1;
    const playerTitle = $('playerTitle'); const playerArtist = $('playerArtist'); const playerThumb = $('playerThumb');
    const playerPlayPause = $('playerPlayPause'); const playerSeek = $('playerSeek'); const playerCurrentTime = $('playerCurrentTime');
    const playerDuration = $('playerDuration'); const playerLikeBtn = $('playerLikeBtn');
    if (playerTitle) playerTitle.textContent = 'No song selected';
    if (playerArtist) playerArtist.textContent = '—';
    if (playerThumb) playerThumb.src = 'https://placehold.co/100x100/181818/333?text=🎵';
    if (playerPlayPause) playerPlayPause.innerHTML = '<i class="fas fa-play"></i>';
    if (playerSeek) playerSeek.value = 0;
    if (playerCurrentTime) playerCurrentTime.textContent = '0:00';
    if (playerDuration) playerDuration.textContent = '0:00';
    if (playerLikeBtn) playerLikeBtn.classList.remove('liked');
    if ($('expandedPlayerOverlay')?.classList.contains('active')) closeExpandedPlayerFn();
    renderSongs(); renderQueue();
}
function updatePlayerUI() {
    if (!state.currentSong) { resetPlayer(); return; }
    const s = state.currentSong;
    const playerTitle = $('playerTitle'); const playerArtist = $('playerArtist'); const playerThumb = $('playerThumb');
    const playerPlayPause = $('playerPlayPause'); const playerDuration = $('playerDuration');
    if (playerTitle) playerTitle.textContent = s.title;
    if (playerArtist) playerArtist.textContent = s.artist;
    if (playerThumb) { playerThumb.src = convertToCdnUrl(s.thumbnailUrl); playerThumb.onerror = function(){ this.src='https://placehold.co/100x100/181818/333?text=🎵'; }; }
    if (playerPlayPause) playerPlayPause.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (audio.duration && playerDuration) playerDuration.textContent = formatTime(audio.duration);
    updatePlayerLikeButton();
    if ($('expandedPlayerOverlay')?.classList.contains('active')) updateExpandedPlayerUI();
}
function updatePlayerLikeButton() {
    const btn = $('playerLikeBtn');
    if (!btn || !state.currentSong) return;
    if (userHasLiked(state.currentSong.id)) btn.classList.add('liked');
    else btn.classList.remove('liked');
}
function updateExpandedLikeButton() {
    const btn = $('expLikeBtn');
    if (!btn || !state.currentSong) return;
    if (userHasLiked(state.currentSong.id)) btn.classList.add('liked');
    else btn.classList.remove('liked');
}
function playPrev() {
    if (state.songs.length === 0) return;
    let idx = state.currentIndex > 0 ? state.currentIndex - 1 : state.songs.length - 1;
    if (shuffleMode) {
        const available = state.songs.filter(s => s.id !== state.currentSong?.id);
        if (available.length > 0) { const song = available[Math.floor(Math.random() * available.length)]; if (song) playSong(song); return; }
    }
    const song = state.songs[idx]; if (song) playSong(song);
}
function playNext() {
    if (state.songs.length === 0) return;
    const nextSong = getNextSong();
    if (nextSong) playSong(nextSong);
    else if (state.songs.length > 0) playSong(state.songs[0]);
}

// ==============================================================
// EXPANDED PLAYER
// ==============================================================
function openExpandedPlayer() { if (!state.currentSong) return; const overlay = $('expandedPlayerOverlay'); if (overlay) { overlay.classList.add('active'); updateExpandedPlayerUI(); } }
function closeExpandedPlayerFn() { const overlay = $('expandedPlayerOverlay'); if (overlay) overlay.classList.remove('active'); }
function updateExpandedPlayerUI() {
    if (!state.currentSong) return;
    const s = state.currentSong;
    const cover = $('expCover'); const title = $('expTitle'); const artist = $('expArtist');
    const playBtn = $('expPlayPause'); const duration = $('expDuration'); const seek = $('expSeek');
    const currentTime = $('expCurrentTime'); const lyrics = $('expLyrics');
    if (cover) { cover.src = convertToCdnUrl(s.thumbnailUrl); cover.onerror = function(){ this.src='https://placehold.co/400x400/181818/333?text=🎵'; }; }
    if (title) title.textContent = s.title;
    if (artist) artist.textContent = s.artist;
    if (playBtn) playBtn.innerHTML = state.isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (audio.duration && duration) duration.textContent = formatTime(audio.duration);
    if (seek) seek.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    if (currentTime) currentTime.textContent = formatTime(audio.currentTime);
    updateExpandedLikeButton();
    if (s.lyrics && lyrics) lyrics.innerHTML = s.lyrics.replace(/\n/g, '<br>');
    else if (lyrics) lyrics.innerHTML = '<div class="lyrics-placeholder">🎵 No lyrics available for this song.</div>';
}

// ==============================================================
// SHARE MODAL
// ==============================================================
function openShareModal(song) {
    if (!song) return;
    const thumb = $('shareThumb'); const title = $('shareTitle'); const artist = $('shareArtist');
    if (thumb) { thumb.src = convertToCdnUrl(song.thumbnailUrl); thumb.onerror = function(){ this.src='https://placehold.co/48x48/181818/333?text=🎵'; }; }
    if (title) title.textContent = song.title;
    if (artist) artist.textContent = song.artist;
    const overlay = $('shareOverlay'); if (overlay) overlay.classList.add('active');
    state._shareSong = song;
}
function closeShareModal() { const overlay = $('shareOverlay'); if (overlay) overlay.classList.remove('active'); state._shareSong = null; }

// ==============================================================
// DOWNLOAD (requires login)
// ==============================================================
async function handleDownload(song) {
    if (!state.authUser) { showToast('Please log in to download songs.', 'info'); const loginBtn = $('authBtn'); if (loginBtn) loginBtn.click(); return; }
    if (!song || !song.audioUrl) { showToast('Download URL not available.', 'error'); return; }
    const cdnUrl = convertToCdnUrl(song.audioUrl);
    try {
        showToast(`Downloading "${song.title}"...`, 'info');
        const response = await fetch(cdnUrl);
        if (!response.ok) throw new Error('Network response was not ok');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${song.title} - ${song.artist}.mp3`;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        await updateDoc(doc(db, 'songs', song.id), { downloads: increment(1) });
        song.downloads = (song.downloads || 0) + 1;
        showToast(`"${song.title}" downloaded!`, 'success');
        renderSongs(); renderRecommendations(); renderRecentlyPlayed();
        if (state.authUser && state.authUser.email === ADMIN_EMAIL) loadAdminSongs();
    } catch (err) { showToast('Download failed: ' + err.message, 'error'); }
}

// ==============================================================
// ADMIN FUNCTIONS
// ==============================================================
function loadAdminSongs() {
    const container = $('adminSongList');
    if (!container) return;
    if (!state.authUser || state.authUser.email !== ADMIN_EMAIL) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Log in as admin to manage songs.</p>';
        return;
    }
    if (state.songs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No songs uploaded yet.</p>';
        return;
    }
    container.innerHTML = state.songs.map(song => `<div class="song-item" data-id="${song.id}">
        <div class="info">
            <div class="title">${escapeHtml(song.title)}</div>
            <div class="artist">${escapeHtml(song.artist)} · ${escapeHtml(song.category || 'Uncategorized')}</div>
            <div class="meta"><span><i class="fas fa-heart" style="color:#ef4444;"></i> ${song.likes||0}</span><span><i class="fas fa-eye"></i> ${song.views||0}</span><span><i class="fas fa-arrow-down"></i> ${song.downloads||0}</span></div>
        </div>
        <div class="actions">
            <button class="btn btn-sm btn-primary edit-song" data-id="${song.id}"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-danger delete-song" data-id="${song.id}"><i class="fas fa-trash-alt"></i></button>
        </div>
    </div>`).join('');
    container.querySelectorAll('.edit-song').forEach(btn => {
        btn.addEventListener('click', () => { const song = state.songs.find(s => s.id === btn.dataset.id); if (song) openEditModal(song); });
    });
    container.querySelectorAll('.delete-song').forEach(btn => {
        btn.addEventListener('click', () => { if (confirm('Delete this song permanently?')) deleteSong(btn.dataset.id); });
    });
}

async function deleteSong(id) {
    if (!state.authUser || state.authUser.email !== ADMIN_EMAIL) return;
    try { await deleteDoc(doc(db, 'songs', id)); showToast('Song deleted.', 'info'); } catch (err) { showToast('Error deleting song.', 'error'); }
}
function openEditModal(song) {
    const newTitle = prompt('Edit song title:', song.title);
    if (newTitle === null) return;
    const newArtist = prompt('Edit artist name:', song.artist);
    if (newArtist === null) return;
    const newCategory = prompt('Edit category:', song.category || '');
    if (newCategory === null) return;
    const newLyrics = prompt('Edit lyrics (or leave empty):', song.lyrics || '');
    if (newLyrics === null) return;
    updateSong(song.id, { title: newTitle.trim(), artist: newArtist.trim(), category: newCategory.trim(), lyrics: newLyrics.trim() });
}
async function updateSong(id, data) {
    if (!state.authUser || state.authUser.email !== ADMIN_EMAIL) return;
    try { await updateDoc(doc(db, 'songs', id), data); showToast('Song updated!', 'success'); } catch (err) { showToast('Error updating song.', 'error'); }
}
async function seedRandomCounts() {
    if (!state.authUser || state.authUser.email !== ADMIN_EMAIL) { showToast('Only admin can perform this action.', 'error'); return; }
    if (!confirm('এটি সব গানের views, likes, downloads র‍্যান্ডম সংখ্যা (1000-5000) দিয়ে ওভাররাইট করবে, যেখানে views > likes > downloads। চালিয়ে যাবেন?')) return;
    try {
        const q = query(collection(db, 'songs'));
        const snapshot = await getDocs(q);
        let updated = 0;
        for (const docSnap of snapshot.docs) {
            const { views, likes, downloads } = generateRandomCounts();
            await updateDoc(doc(db, 'songs', docSnap.id), { views, likes, downloads });
            updated++;
        }
        showToast(`✅ ${updated} টি গানের কাউন্ট আপডেট করা হয়েছে!`, 'success');
        listenSongs();
    } catch (err) { showToast('Error seeding random counts: ' + err.message, 'error'); }
}

// ==============================================================
// FIRESTORE LISTEN
// ==============================================================
let unsubscribeSongs = null;
function listenSongs() {
    if (unsubscribeSongs) unsubscribeSongs();
    const q = query(collection(db, 'songs'), orderBy('uploadDate', 'desc'));
    unsubscribeSongs = onSnapshot(q, (snapshot) => {
        const songs = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            songs.push({ id: doc.id, ...data, likes: data.likes || 0, views: data.views || 0, downloads: data.downloads || 0, lyrics: data.lyrics || '' });
        });
        state.songs = songs;
        state.categories = new Set(songs.map(s => s.category).filter(Boolean));
        populateCategoryFilter();
        renderSongs(); renderRecommendations(); renderRecentlyPlayed();
        updateStats(); updateFavCount();
        if (state.authUser && state.authUser.email === ADMIN_EMAIL) loadAdminSongs();
        if (state.currentSong && !songs.find(s => s.id === state.currentSong.id)) { state.currentSong = null; state.currentIndex = -1; resetPlayer(); }
        const spinner = $('loadingSpinner'); if (spinner) spinner.classList.add('hidden');
        loadPlaylists(); renderPlaylists(); renderQueue();
        if (state.currentSong) { updatePlayerLikeButton(); updateExpandedLikeButton(); }
    }, (err) => { showToast('Error loading songs.', 'error'); const spinner = $('loadingSpinner'); if (spinner) spinner.classList.add('hidden'); });
}

// ==============================================================
// AUTH — Login / Signup / Google
// ==============================================================
function updateAuthUI(user) {
    state.authUser = user;
    const profile = $('userProfile'); const authBtn = $('authBtn'); const adminToggle = $('adminToggleBtn');
    if (user) {
        if (profile) { profile.style.display = 'flex'; const name = user.displayName || user.email || 'User'; const initial = name.charAt(0).toUpperCase(); const displayName = $('userDisplayName'); const avatarImg = $('userAvatarImg'); const avatarPlaceholder = $('userAvatarPlaceholder'); if (displayName) displayName.textContent = name; if (user.photoURL && avatarImg) { avatarImg.style.display = 'block'; avatarImg.src = user.photoURL; if (avatarPlaceholder) avatarPlaceholder.style.display = 'none'; } else if (avatarPlaceholder) { avatarImg.style.display = 'none'; avatarPlaceholder.style.display = 'flex'; avatarPlaceholder.textContent = initial; } }
        if (authBtn) authBtn.style.display = 'none';
        const isAdmin = (user.email === ADMIN_EMAIL);
        state.isAdmin = isAdmin;
        const dashboardPage = document.querySelector('.dashboard-page');
        if (isAdmin) {
            if (dashboardPage) { loadAdminSongs(); updateStats(); }
            if (adminToggle) adminToggle.innerHTML = '<i class="fas fa-chart-pie"></i> Dashboard';
        } else {
            if (adminToggle) adminToggle.innerHTML = '<i class="fas fa-user-shield"></i> Admin';
        }
        if (!dashboardPage) showToast(`Welcome, ${user.displayName || 'User'}!`, 'success');
    } else {
        if (profile) profile.style.display = 'none';
        if (authBtn) authBtn.style.display = 'inline-flex';
        state.isAdmin = false;
        if (adminToggle) adminToggle.innerHTML = '<i class="fas fa-user-shield"></i> Admin';
        const adminSongList = $('adminSongList');
        if (adminSongList) adminSongList.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Log in to manage songs.</p>';
    }
}

onAuthStateChanged(auth, (user) => {
    updateAuthUI(user);
    if (user && user.email === ADMIN_EMAIL) { updateStats(); loadAdminSongs(); }
});

// Login page specific
const loginView = $('loginView');
const signupView = $('signupView');
if (loginView && signupView) {
    $('switchToSignup')?.addEventListener('click', (e) => { e.preventDefault(); loginView.style.display = 'none'; signupView.style.display = 'block'; });
    $('switchToLogin')?.addEventListener('click', (e) => { e.preventDefault(); loginView.style.display = 'block'; signupView.style.display = 'none'; });
    $('loginForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('loginEmail')?.value.trim(); const password = $('loginPassword')?.value;
        try { await signInWithEmailAndPassword(auth, email, password); window.location.href = 'main.html'; }
        catch (err) { const errEl = $('loginError'); if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); } }
    });
    $('signupForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('signupName')?.value.trim(); const email = $('signupEmail')?.value.trim(); const password = $('signupPassword')?.value;
        try { const cred = await createUserWithEmailAndPassword(auth, email, password); await updateProfile(cred.user, { displayName: name || 'User' }); window.location.href = 'main.html'; }
        catch (err) { const errEl = $('signupError'); if (errEl) { errEl.textContent = err.message; errEl.classList.add('show'); } }
    });
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ client_id: '635746561853-62pjvjs4mt6hjh4dspl8on1uo5pcbejj.apps.googleusercontent.com' });
    const googleLogin = $('googleLoginBtn'); const googleSignup = $('googleSignupBtn');
    const handleGoogle = async () => { try { await signInWithPopup(auth, provider); window.location.href = 'main.html'; } catch (err) { if (err.code !== 'auth/popup-closed-by-user') showToast('Google sign-in failed: ' + err.message, 'error'); } };
    if (googleLogin) googleLogin.addEventListener('click', handleGoogle);
    if (googleSignup) googleSignup.addEventListener('click', handleGoogle);
}

// Logout
$('dropdownLogout')?.addEventListener('click', async () => { try { await signOut(auth); showToast('Logged out.', 'info'); window.location.href = 'index.html'; } catch (err) { showToast('Error logging out.', 'error'); } });
$('logoutBtn')?.addEventListener('click', async () => { try { await signOut(auth); showToast('Logged out.', 'info'); window.location.href = 'index.html'; } catch (err) { showToast('Error logging out.', 'error'); } });

// Auth button in header
$('authBtn')?.addEventListener('click', () => { window.location.href = 'login.html'; });

// Admin toggle in main header
$('adminToggleBtn')?.addEventListener('click', () => {
    if (state.authUser && state.authUser.email === ADMIN_EMAIL) {
        window.location.href = 'dashboard.html';
    } else {
        window.location.href = 'login.html';
    }
});

// ==============================================================
// EVENT BINDINGS (main.html)
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Theme toggle
    const themeToggle = $('themeToggle');
    if (themeToggle) {
        const getTheme = () => localStorage.getItem('melodify_theme') || 'dark';
        const setTheme = (theme) => {
            if (theme === 'light') { document.documentElement.setAttribute('data-theme', 'light'); themeToggle.innerHTML = '<i class="fas fa-sun"></i>'; }
            else { document.documentElement.removeAttribute('data-theme'); themeToggle.innerHTML = '<i class="fas fa-moon"></i>'; }
            localStorage.setItem('melodify_theme', theme);
        };
        themeToggle.addEventListener('click', () => { const current = getTheme(); setTheme(current === 'dark' ? 'light' : 'dark'); });
        setTheme(getTheme());
    }

    // Favorites toggle
    const favToggle = $('favoritesToggle');
    if (favToggle) {
        favToggle.addEventListener('click', () => {
            state.showFavoritesOnly = !state.showFavoritesOnly;
            if (state.showFavoritesOnly) { favToggle.classList.add('active'); const count = getLikedSongIds().length; if (count === 0) showToast('No liked songs yet. ❤️ some songs!', 'info'); }
            else { favToggle.classList.remove('active'); }
            renderSongs();
        });
    }

    // Search input
    const searchInput = $('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => { state.searchTerm = searchInput.value; renderSongs(); });
        searchInput.addEventListener('focus', () => { if (searchInput.value.length > 0) renderAutocomplete(searchInput.value); });
    }

    // Category filter
    const categoryFilter = $('categoryFilter');
    if (categoryFilter) categoryFilter.addEventListener('change', () => { state.categoryFilter = categoryFilter.value; renderSongs(); });

    // Sort
    const sortSelect = $('sortSelect');
    if (sortSelect) sortSelect.addEventListener('change', () => { state.sortMode = sortSelect.value; renderSongs(); });

    // Playlist toggle
    const playlistBtn = $('playlistToggleBtn');
    if (playlistBtn) {
        playlistBtn.addEventListener('click', () => {
            const overlay = $('playlistOverlay');
            if (overlay) { overlay.classList.toggle('active'); if (overlay.classList.contains('active')) { loadPlaylists(); renderPlaylists(); const mainView = $('playlistMainView'); const detailView = $('playlistDetailView'); if (mainView) mainView.style.display = 'block'; if (detailView) detailView.classList.remove('active'); } }
        });
    }
    $('closePlaylistPanel')?.addEventListener('click', () => { const overlay = $('playlistOverlay'); if (overlay) overlay.classList.remove('active'); });
    $('playlistOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); });

    // Create playlist
    $('createPlaylistBtn')?.addEventListener('click', () => {
        const input = $('newPlaylistName');
        if (input && input.value.trim()) { createPlaylist(input.value.trim()); input.value = ''; }
    });
    $('backFromDetail')?.addEventListener('click', () => { const mainView = $('playlistMainView'); const detailView = $('playlistDetailView'); if (mainView) mainView.style.display = 'block'; if (detailView) detailView.classList.remove('active'); renderPlaylists(); });

    // Queue
    const queueToggle = $('playerQueueToggle');
    if (queueToggle) {
        queueToggle.addEventListener('click', () => {
            const overlay = $('queueOverlay');
            if (overlay) { if (overlay.classList.contains('active')) overlay.classList.remove('active'); else { renderQueue(); overlay.classList.add('active'); } }
        });
    }
    $('closeQueuePanel')?.addEventListener('click', () => { const overlay = $('queueOverlay'); if (overlay) overlay.classList.remove('active'); });
    $('queueOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); });

    // Shortcuts
    $('shortcutsToggleBtn')?.addEventListener('click', () => { const overlay = $('shortcutsOverlay'); if (overlay) overlay.classList.toggle('active'); });
    $('closeShortcutsPanel')?.addEventListener('click', () => { const overlay = $('shortcutsOverlay'); if (overlay) overlay.classList.remove('active'); });
    $('shortcutsOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('active'); });

    // Sleep timer
    const sleepBtn = $('playerSleepBtn');
    if (sleepBtn) {
        sleepBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const overlay = $('sleepTimerOverlay');
            if (overlay) {
                const rect = sleepBtn.getBoundingClientRect();
                let left = rect.left + window.scrollX - 20;
                let top = rect.top + window.scrollY - 120;
                if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
                if (top < 10) top = rect.bottom + window.scrollY + 6;
                overlay.style.left = left + 'px';
                overlay.style.top = top + 'px';
                overlay.classList.toggle('active');
            }
        });
        document.addEventListener('click', (e) => {
            const overlay = $('sleepTimerOverlay');
            if (overlay && overlay.classList.contains('active')) {
                if (!overlay.contains(e.target) && !e.target.closest('.sleep-btn')) overlay.classList.remove('active');
            }
        });
        const stOpts = document.querySelectorAll('.st-opt');
        stOpts.forEach(btn => {
            btn.addEventListener('click', () => {
                const mins = parseInt(btn.dataset.minutes);
                startSleepTimer(mins);
            });
        });
        $('stCancel')?.addEventListener('click', cancelSleepTimer);
    }

    // Player controls
    $('playerPlayPause')?.addEventListener('click', togglePlayPause);
    $('playerPrev')?.addEventListener('click', playPrev);
    $('playerNext')?.addEventListener('click', playNext);
    $('playerShuffle')?.addEventListener('click', toggleShuffle);
    $('playerRepeat')?.addEventListener('click', toggleRepeat);
    $('playerLikeBtn')?.addEventListener('click', () => { if (state.currentSong) toggleLike(state.currentSong.id); });
    $('playerDownloadBtn')?.addEventListener('click', () => { if (state.currentSong) handleDownload(state.currentSong); });
    $('playerShareBtn')?.addEventListener('click', () => { if (state.currentSong) openShareModal(state.currentSong); });
    $('playerAddToPlaylistBtn')?.addEventListener('click', () => { if (state.currentSong) showAddToPlaylistPopup(state.currentSong.id, $('playerAddToPlaylistBtn')); });
    $('playerInfoTrigger')?.addEventListener('click', () => { if (state.currentSong) openExpandedPlayer(); });

    // Player seek
    const playerSeek = $('playerSeek');
    if (playerSeek) {
        playerSeek.addEventListener('input', () => {
            if (audio.duration) {
                const time = (parseFloat(playerSeek.value) / 100) * audio.duration;
                audio.currentTime = time;
                const currentTime = $('playerCurrentTime');
                if (currentTime) currentTime.textContent = formatTime(time);
                const expSeek = $('expSeek');
                if (expSeek) expSeek.value = playerSeek.value;
                const expCurrentTime = $('expCurrentTime');
                if (expCurrentTime) expCurrentTime.textContent = formatTime(time);
            }
        });
    }

    // Volume
    const volume = $('playerVolume');
    if (volume) {
        volume.addEventListener('input', () => { audio.volume = parseFloat(volume.value); updateVolumeIcon(); });
        $('playerVolumeToggle')?.addEventListener('click', () => {
            if (audio.volume > 0) { audio.volume = 0; volume.value = 0; }
            else { audio.volume = 0.8; volume.value = 0.8; }
            updateVolumeIcon();
        });
    }

    // Expanded player
    $('closeExpandedPlayer')?.addEventListener('click', closeExpandedPlayerFn);
    $('expandedPlayerOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeExpandedPlayerFn(); });
    $('expPlayPause')?.addEventListener('click', togglePlayPause);
    $('expPrev')?.addEventListener('click', playPrev);
    $('expNext')?.addEventListener('click', playNext);
    $('expLikeBtn')?.addEventListener('click', () => { if (state.currentSong) toggleLike(state.currentSong.id); });
    $('expShuffleBtn')?.addEventListener('click', toggleShuffle);
    $('expRepeatBtn')?.addEventListener('click', toggleRepeat);
    $('expQueueBtn')?.addEventListener('click', () => { closeExpandedPlayerFn(); const overlay = $('queueOverlay'); if (overlay) { if (overlay.classList.contains('active')) overlay.classList.remove('active'); else { renderQueue(); overlay.classList.add('active'); } } });
    $('expDownloadBtn')?.addEventListener('click', () => { if (state.currentSong) handleDownload(state.currentSong); });
    $('expShareBtn')?.addEventListener('click', () => { if (state.currentSong) openShareModal(state.currentSong); });
    const expSeek = $('expSeek');
    if (expSeek) {
        expSeek.addEventListener('input', () => {
            if (audio.duration) {
                const time = (parseFloat(expSeek.value) / 100) * audio.duration;
                audio.currentTime = time;
                const expCurrentTime = $('expCurrentTime');
                if (expCurrentTime) expCurrentTime.textContent = formatTime(time);
                const playerSeek = $('playerSeek');
                if (playerSeek) playerSeek.value = expSeek.value;
                const playerCurrentTime = $('playerCurrentTime');
                if (playerCurrentTime) playerCurrentTime.textContent = formatTime(time);
            }
        });
    }

    // Share
    $('closeSharePanel')?.addEventListener('click', closeShareModal);
    $('shareOverlay')?.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeShareModal(); });
    $('shareCopyLink')?.addEventListener('click', () => { if (state._shareSong) { const text = `🎵 "${state._shareSong.title}" by ${state._shareSong.artist} — Listen on Melodify 🎧`; navigator.clipboard.writeText(text).then(() => { showToast('Copied!', 'success'); closeShareModal(); }).catch(() => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); showToast('Copied!', 'success'); closeShareModal(); }); } });
    $('shareTwitter')?.addEventListener('click', () => { if (state._shareSong) { window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🎵 "${state._shareSong.title}" by ${state._shareSong.artist} — Listen on Melodify 🎧`)}`, '_blank'); closeShareModal(); } });
    $('shareWhatsApp')?.addEventListener('click', () => { if (state._shareSong) { window.open(`https://wa.me/?text=${encodeURIComponent(`🎵 "${state._shareSong.title}" by ${state._shareSong.artist} — Listen on Melodify 🎧`)}`, '_blank'); closeShareModal(); } });
    $('shareTelegram')?.addEventListener('click', () => { if (state._shareSong) { window.open(`https://t.me/share/url?url=${encodeURIComponent(`https://melodify.app/song/${state._shareSong.id}`)}&text=${encodeURIComponent(`🎵 "${state._shareSong.title}" by ${state._shareSong.artist} — Listen on Melodify 🎧`)}`, '_blank'); closeShareModal(); } });

    // Clear history
    $('clearHistoryBtn')?.addEventListener('click', () => { if (confirm('Clear your listening history?')) clearPlayHistory(); });

    // Admin tabs (dashboard)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            const target = $(btn.dataset.tab);
            if (target) target.classList.add('active');
        });
    });

    // Admin upload form
    $('uploadForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!state.authUser || state.authUser.email !== ADMIN_EMAIL) { showToast('Please log in as admin.', 'error'); return; }
        const title = $('songTitle')?.value.trim(); const artist = $('songArtist')?.value.trim();
        const category = $('songCategory')?.value.trim(); let audioUrl = $('songAudioUrl')?.value.trim();
        let thumbUrl = $('songThumbUrl')?.value.trim(); const lyrics = $('songLyrics')?.value.trim();
        if (!title || !artist || !category || !audioUrl || !thumbUrl) { showToast('Please fill all required fields.', 'error'); return; }
        audioUrl = convertToCdnUrl(audioUrl); thumbUrl = convertToCdnUrl(thumbUrl);
        const btn = $('uploadBtn'); const progress = $('uploadProgress');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
        if (progress) progress.classList.add('show');
        const { views, likes, downloads } = generateRandomCounts();
        try {
            await addDoc(collection(db, 'songs'), { title, artist, category, thumbnailUrl: thumbUrl, audioUrl: audioUrl, lyrics: lyrics || '', downloads, likes, views, uploadDate: Timestamp.now() });
            const fill = $('uploadProgressFill'); const status = $('uploadStatus'); const percent = $('uploadPercent');
            if (fill) fill.style.width = '100%'; if (percent) percent.textContent = '100%'; if (status) status.textContent = '✅ Saved!';
            showToast(`"${title}" added!`, 'success');
            if (e.target) e.target.reset();
            setTimeout(() => { if (progress) progress.classList.remove('show'); }, 2000);
        } catch (err) { showToast('Failed to save: ' + err.message, 'error'); if (status) status.textContent = '❌ Failed.'; }
        finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Song'; } }
    });

    // Seed random counts
    $('seedRandomBtn')?.addEventListener('click', seedRandomCounts);

    // Batch upload (simplified)
    $('addSongRow')?.addEventListener('click', () => {
        const container = $('songRows');
        if (!container) return;
        const index = container.children.length;
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<div class="row-header"><span>#${index+1}</span><button class="btn btn-sm btn-danger remove-row"><i class="fas fa-times"></i></button></div>
            <div class="row-fields"><div><input class="row-title" placeholder="Title" /></div><div><input class="row-artist" placeholder="Artist" /></div><div><input class="row-category" placeholder="Category" /></div></div>
            <div class="row-files"><div><label>Audio</label><input type="file" class="row-audio" accept=".mp3,.webm,.wav,.ogg" /></div><div><label>Cover</label><input type="file" class="row-image" accept=".png,.jpg,.jpeg,.webp" /></div></div>
            <div><input class="row-lyrics" placeholder="Lyrics (optional)" /></div>
            <div class="row-status"></div>`;
        container.appendChild(row);
        row.querySelector('.remove-row').addEventListener('click', () => { row.remove(); });
    });

    // Audio events
    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            const progress = (audio.currentTime / audio.duration) * 100;
            const playerSeek = $('playerSeek');
            if (playerSeek) playerSeek.value = progress;
            const playerCurrentTime = $('playerCurrentTime');
            if (playerCurrentTime) playerCurrentTime.textContent = formatTime(audio.currentTime);
            if ($('expandedPlayerOverlay')?.classList.contains('active')) {
                const expSeek = $('expSeek');
                if (expSeek) expSeek.value = progress;
                const expCurrentTime = $('expCurrentTime');
                if (expCurrentTime) expCurrentTime.textContent = formatTime(audio.currentTime);
            }
        }
    });
    audio.addEventListener('loadedmetadata', () => {
        const playerDuration = $('playerDuration');
        if (playerDuration) playerDuration.textContent = formatTime(audio.duration);
        if ($('expandedPlayerOverlay')?.classList.contains('active')) {
            const expDuration = $('expDuration');
            if (expDuration) expDuration.textContent = formatTime(audio.duration);
        }
    });
    audio.addEventListener('ended', () => {
        state.isPlaying = false;
        updatePlayerUI();
        renderSongs();
        if (repeatMode === 'one') { audio.currentTime = 0; audio.play().then(() => { state.isPlaying = true; updatePlayerUI(); if ($('expandedPlayerOverlay')?.classList.contains('active')) updateExpandedPlayerUI(); }).catch(() => {}); return; }
        const nextSong = getNextSong();
        if (nextSong) playSong(nextSong);
        else if (repeatMode === 'all' && state.songs.length > 0) playSong(state.songs[0]);
        else resetPlayer();
    });
    audio.addEventListener('error', () => { showToast('Audio playback error.', 'error'); state.isPlaying = false; updatePlayerUI(); });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        switch(e.key) {
            case ' ': e.preventDefault(); togglePlayPause(); break;
            case 'ArrowRight': e.preventDefault(); if (audio.duration) audio.currentTime = Math.min(audio.currentTime + 10, audio.duration); break;
            case 'ArrowLeft': e.preventDefault(); if (audio.duration) audio.currentTime = Math.max(audio.currentTime - 10, 0); break;
            case 'ArrowUp': e.preventDefault(); audio.volume = Math.min(audio.volume + 0.1, 1); const vol = $('playerVolume'); if (vol) vol.value = audio.volume; updateVolumeIcon(); break;
            case 'ArrowDown': e.preventDefault(); audio.volume = Math.max(audio.volume - 0.1, 0); const volDown = $('playerVolume'); if (volDown) volDown.value = audio.volume; updateVolumeIcon(); break;
            case 'f': case 'F': if (state.currentSong) toggleLike(state.currentSong.id); break;
            case 'q': case 'Q': const qOverlay = $('queueOverlay'); if (qOverlay) { if (qOverlay.classList.contains('active')) qOverlay.classList.remove('active'); else { renderQueue(); qOverlay.classList.add('active'); } } break;
            case 'e': case 'E': if (state.currentSong) { if ($('expandedPlayerOverlay')?.classList.contains('active')) closeExpandedPlayerFn(); else openExpandedPlayer(); } break;
            case '?': e.preventDefault(); const sOverlay = $('shortcutsOverlay'); if (sOverlay) sOverlay.classList.toggle('active'); break;
            case 'Escape': if ($('shortcutsOverlay')?.classList.contains('active')) $('shortcutsOverlay').classList.remove('active'); if ($('queueOverlay')?.classList.contains('active')) $('queueOverlay').classList.remove('active'); if ($('shareOverlay')?.classList.contains('active')) closeShareModal(); break;
        }
    });
    document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === '/') { e.preventDefault(); const sOverlay = $('shortcutsOverlay'); if (sOverlay) sOverlay.classList.toggle('active'); } });

    // Update volume icon
    function updateVolumeIcon() {
        const icon = $('playerVolumeToggle')?.querySelector('i');
        if (!icon) return;
        const vol = audio.volume;
        if (vol === 0) icon.className = 'fas fa-volume-mute';
        else if (vol < 0.5) icon.className = 'fas fa-volume-down';
        else icon.className = 'fas fa-volume-up';
    }

    // Sleep timer functions
    function startSleepTimer(minutes) {
        if (sleepTimerTimeout) { clearTimeout(sleepTimerTimeout); sleepTimerTimeout = null; }
        const ms = minutes * 60 * 1000;
        const status = $('stStatus');
        if (status) { status.textContent = `⏱️ Timer set for ${minutes} min`; status.style.color = '#f59e0b'; }
        const sleepBtn = $('playerSleepBtn');
        if (sleepBtn) sleepBtn.classList.add('active');
        sleepTimerTimeout = setTimeout(() => {
            if (state.isPlaying) { togglePlayPause(); showToast(`⏰ Sleep timer: "${state.currentSong?.title}" paused.`, 'info'); }
            if (status) { status.textContent = '⏱️ Timer off'; status.style.color = 'var(--text-muted)'; }
            if (sleepBtn) sleepBtn.classList.remove('active');
            sleepTimerTimeout = null;
        }, ms);
        const overlay = $('sleepTimerOverlay');
        if (overlay) overlay.classList.remove('active');
        showToast(`Sleep timer set for ${minutes} minutes.`, 'info');
    }
    function cancelSleepTimer() {
        if (sleepTimerTimeout) { clearTimeout(sleepTimerTimeout); sleepTimerTimeout = null; }
        const status = $('stStatus');
        if (status) { status.textContent = '⏱️ Timer off'; status.style.color = 'var(--text-muted)'; }
        const sleepBtn = $('playerSleepBtn');
        if (sleepBtn) sleepBtn.classList.remove('active');
        const overlay = $('sleepTimerOverlay');
        if (overlay) overlay.classList.remove('active');
        showToast('Sleep timer cancelled.', 'info');
    }

    // Add to playlist popup
    function showAddToPlaylistPopup(songId, anchorElement) {
        state.pendingSongForPopup = songId;
        const popup = $('addToPlaylistPopup');
        if (!popup) return;
        const rect = anchorElement.getBoundingClientRect();
        let left = rect.left + window.scrollX; let top = rect.bottom + window.scrollY + 6;
        if (left + 200 > window.innerWidth) left = window.innerWidth - 210;
        if (top + 200 > window.innerHeight) top = rect.top + window.scrollY - 210;
        popup.style.left = left + 'px'; popup.style.top = top + 'px';
        const list = $('popupPlaylistList');
        if (list) {
            if (state.playlists.length === 0) list.innerHTML = '<div style="color:var(--text-muted); font-size:0.75rem; padding:0.2rem;">No playlists</div>';
            else {
                list.innerHTML = state.playlists.map(pl => `<div class="popup-item" data-id="${pl.id}"><i class="fas fa-list"></i> ${escapeHtml(pl.name)}</div>`).join('');
                list.querySelectorAll('.popup-item').forEach(el => {
                    el.addEventListener('click', () => { addSongToPlaylist(el.dataset.id, state.pendingSongForPopup); popup.classList.remove('active'); });
                });
            }
        }
        popup.classList.add('active');
    }
    $('popupCreatePlaylistBtn')?.addEventListener('click', () => {
        const name = $('popupNewPlaylistName')?.value.trim();
        if (name) { createPlaylist(name); if ($('popupNewPlaylistName')) $('popupNewPlaylistName').value = ''; if (state.pendingSongForPopup) showAddToPlaylistPopup(state.pendingSongForPopup, $('playerAddToPlaylistBtn') || document.body); }
    });

    // Autocomplete
    function renderAutocomplete(query) {
        const dropdown = $('autocompleteDropdown');
        if (!dropdown || !query || query.length < 1) { if (dropdown) dropdown.classList.remove('active'); return; }
        const q = query.toLowerCase().trim();
        const matches = state.songs.filter(song => song.title.toLowerCase().includes(q) || song.artist.toLowerCase().includes(q) || (song.category || '').toLowerCase().includes(q)).slice(0, 8);
        if (matches.length === 0) { dropdown.innerHTML = `<div class="ac-empty">No results found</div>`; dropdown.classList.add('active'); return; }
        dropdown.innerHTML = matches.map(song => {
            const thumb = convertToCdnUrl(song.thumbnailUrl);
            return `<div class="ac-item" data-id="${song.id}">
                <img class="ac-thumb" src="${thumb}" alt="" onerror="this.src='https://placehold.co/100x100/181818/333?text=🎵';" />
                <div class="ac-info"><div class="ac-title">${escapeHtml(song.title)}</div><div class="ac-artist">${escapeHtml(song.artist)}</div></div>
                <span class="ac-badge">${escapeHtml(song.category||'Song')}</span>
            </div>`;
        }).join('');
        dropdown.classList.add('active');
        dropdown.querySelectorAll('.ac-item').forEach(el => {
            el.addEventListener('click', () => { const song = state.songs.find(s => s.id === el.dataset.id); if (song) { searchInput.value = song.title; dropdown.classList.remove('active'); playSong(song); state.searchTerm = song.title; renderSongs(); } });
        });
    }

    // User profile dropdown
    const userProfile = $('userProfile');
    if (userProfile) {
        userProfile.addEventListener('click', (e) => { e.stopPropagation(); const dropdown = $('userDropdown'); if (dropdown) dropdown.classList.toggle('active'); });
        document.addEventListener('click', () => { const dropdown = $('userDropdown'); if (dropdown) dropdown.classList.remove('active'); });
    }
    $('dropdownProfile')?.addEventListener('click', () => { if (state.authUser) showToast(`Logged in as ${state.authUser.email}`, 'info'); const dropdown = $('userDropdown'); if (dropdown) dropdown.classList.remove('active'); });
    $('dropdownPlaylists')?.addEventListener('click', () => { const dropdown = $('userDropdown'); if (dropdown) dropdown.classList.remove('active'); const overlay = $('playlistOverlay'); if (overlay) { overlay.classList.add('active'); loadPlaylists(); renderPlaylists(); const mainView = $('playlistMainView'); const detailView = $('playlistDetailView'); if (mainView) mainView.style.display = 'block'; if (detailView) detailView.classList.remove('active'); } });

    // Initialize
    listenSongs();
    audio.volume = parseFloat($('playerVolume')?.value || 0.8);
    updateVolumeIcon();
    updateFavCount();
    if (state.authUser && state.authUser.email === ADMIN_EMAIL) { loadAdminSongs(); updateStats(); }
    console.log('🎵 Melodify loaded.');
});
