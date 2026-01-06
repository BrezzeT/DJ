const socket = io();

// === Элементы ===
const songInput = document.getElementById('song-input');
const addBtn = document.getElementById('add-btn');
const trackList = document.getElementById('track-list');
const usersCountElement = document.getElementById('users-online');
const nowPlayingElement = document.getElementById('now-playing');
const searchResults = document.getElementById('search-results');

// Хост элементы
const becomeHostBtn = document.getElementById('become-host-btn');
const hostTakenMsg = document.getElementById('host-taken-msg');
const hostControlsPanel = document.getElementById('host-controls-panel');
const playerContainer = document.getElementById('player-container');
const subtitleText = document.getElementById('subtite-text');

// Кнопки управления плеером
const btnPause = document.getElementById('ctrl-pause');
const btnPlay = document.getElementById('ctrl-play');
const volSlider = document.getElementById('vol-slider');

let isHost = false;
let player = null;
let localQueue = [];

// === YOUTUBE INIT ===
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function onYouTubeIframeAPIReady() {
    console.log('YouTube API готов');
}

function initPlayer() {
    // Если уже есть плеер, не создаем дубль
    if (player) return;

    player = new YT.Player('youtube-player', {
        height: '1',
        width: '1',
        videoId: '',
        playerVars: { 'playsinline': 1, 'autoplay': 1 },
        events: {
            'onStateChange': onPlayerStateChange,
            'onReady': onPlayerReady
        }
    });
}

function onPlayerReady(event) {
    if (localQueue.length > 0) {
        const firstSongId = getYouTubeID(localQueue[0].name);
        if (firstSongId) {
            event.target.loadVideoById(firstSongId);
            event.target.setVolume(100); // Громкость на максимум
        }
    }
}

function onPlayerStateChange(event) {
    if (event.data === 0) { // ENDED
        playNext();
    }
}

function playNext() {
    if (localQueue.length > 0) {
        socket.emit('delete-song', localQueue[0].id);
    }
}

function getYouTubeID(url) {
    let videoId = "";
    try {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        if (match && match[2].length === 11) {
            videoId = match[2];
        } else { return null; }
    } catch (e) { return null; }
    return videoId;
}

// === УПРАВЛЕНИЕ ХОСТОМ (КНОПКИ) ===
btnPause.addEventListener('click', () => {
    if (player && typeof player.pauseVideo === 'function') {
        player.pauseVideo();
        btnPause.style.background = '#ff5555'; // Подсветка что нажато
        btnPlay.style.background = '#333';
    }
});

btnPlay.addEventListener('click', () => {
    if (player && typeof player.playVideo === 'function') {
        player.playVideo();
        btnPlay.style.background = '#00ff88'; // Подсветка что нажато
        btnPause.style.background = '#333';
    }
});

volSlider.addEventListener('input', (e) => {
    const val = e.target.value;
    if (player && typeof player.setVolume === 'function') {
        player.setVolume(val);
    }
});


// === ЛОГИКА "КТО ХОСТ" ===

// 1. Попытка стать хостом
becomeHostBtn.addEventListener('click', () => {
    socket.emit('claim-host');
});

// 2. Сервер одобрил: "Ты Хост"
socket.on('you-are-host', () => {
    isHost = true;

    // Прячем кнопку "Стать хостом"
    becomeHostBtn.style.display = 'none';
    hostTakenMsg.style.display = 'none';

    // Показываем панель управления
    hostControlsPanel.style.display = 'block';

    // Убираем лишний текст
    subtitleText.style.display = 'none';

    // Включаем плеер
    playerContainer.style.display = 'block';
    initPlayer();
});

// 3. Сервер обновил статус: "Хост есть/нет"
socket.on('host-status', (status) => {
    // Если МЫ хост, нам это не важно, у нас своя панель
    if (isHost) return;

    if (status.hasHost) {
        // Если хост занят кем-то другим
        becomeHostBtn.style.display = 'none';
        hostTakenMsg.style.display = 'block';
    } else {
        // Если место свободно
        becomeHostBtn.style.display = 'block';
        hostTakenMsg.style.display = 'none';
    }
});


// === RENDERING ===
function renderQueue(queueArray) {
    trackList.innerHTML = "";
    localQueue = queueArray;

    if (queueArray.length === 0) {
        nowPlayingElement.textContent = "Нажми НАЙТИ и выбери песню...";
        if (isHost && player && typeof player.stopVideo === 'function') {
            player.stopVideo();
        }
        return;
    }

    nowPlayingElement.textContent = queueArray[0].name;

    queueArray.forEach((song, index) => {
        const li = document.createElement('li');
        if (index === 0) {
            li.style.borderLeft = "5px solid #00ff88";
            li.style.background = "#222";
        }

        const span = document.createElement('span');

        if (song.name.includes('http')) {
            if (song.name.includes('youtube') || song.name.includes('youtu.be')) {
                span.textContent = song.name;
            } else {
                span.textContent = song.name;
            }
        } else {
            span.textContent = song.name;
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '✖';
        deleteBtn.className = 'delete-btn';
        deleteBtn.onclick = () => {
            socket.emit('delete-song', song.id);
        };

        li.appendChild(span);
        li.appendChild(deleteBtn);
        trackList.appendChild(li);
    });

    if (isHost && player && player.loadVideoById) {
        if (queueArray.length === 0) {
            player.pauseVideo();
            player.stopVideo();
            return;
        }

        const firstSongId = getYouTubeID(queueArray[0].name);
        let currentVideoId = "";
        try { if (player.getVideoData()) currentVideoId = player.getVideoData().video_id; } catch (e) { }

        if (currentVideoId !== firstSongId) {
            player.loadVideoById(firstSongId);
        } else {
            const state = player.getPlayerState();
            if (state !== 1 && state !== 3) player.playVideo();
        }
    }
}

// === SEARCH ===
addBtn.addEventListener('click', () => {
    const text = songInput.value.trim();
    if (!text) return;
    const ytID = getYouTubeID(text);
    if (ytID) {
        socket.emit('new-song', text);
        songInput.value = "";
        searchResults.style.display = "none";
    } else {
        addBtn.textContent = "⏳";
        socket.emit('search', text);
    }
});

socket.on('search-results', (videos) => {
    addBtn.textContent = "НАЙТИ";
    renderSearchResults(videos);
});

function renderSearchResults(videos) {
    searchResults.innerHTML = "";
    searchResults.style.display = "flex";

    const closeBtn = document.createElement('div');
    closeBtn.id = 'close-search';
    closeBtn.textContent = "ЗАКРЫТЬ X";
    closeBtn.onclick = () => { searchResults.style.display = "none"; };
    searchResults.appendChild(closeBtn);

    videos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'search-item';

        const img = document.createElement('img');
        img.src = video.thumbnail;

        const info = document.createElement('div');
        info.className = 'search-item-info';

        const title = document.createElement('div');
        title.className = 'search-item-title';
        title.textContent = video.title;

        const author = document.createElement('div');
        author.className = 'search-item-author';
        author.textContent = video.author.name;

        info.appendChild(title);
        info.appendChild(author);
        item.appendChild(img);
        item.appendChild(info);

        item.onclick = () => {
            socket.emit('new-song', video.url);
            songInput.value = "";
            searchResults.style.display = "none";
        };

        searchResults.appendChild(item);
    });
}

socket.on('update-queue', (serverQueue) => { renderQueue(serverQueue); });
socket.on('users-count', (count) => { usersCountElement.textContent = `Онлайн: ${count}`; });
