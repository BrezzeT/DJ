const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const ytSearch = require('yt-search');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let connectedUsers = 0;
let queue = [];
let hostSocketId = null; // ID того, кто сейчас главный (Хост)

io.on('connection', (socket) => {
    connectedUsers++;
    io.emit('users-count', connectedUsers);
    socket.emit('update-queue', queue);

    // Сообщаем новому пользователю, занят ли хост
    // Если hostSocketId не null, значит хост уже есть
    socket.emit('host-status', { hasHost: hostSocketId !== null });

    // === ЛОГИКА ХОСТА ===
    socket.on('claim-host', () => {
        if (hostSocketId === null) {
            hostSocketId = socket.id;
            console.log('Новый хост:', hostSocketId);
            // Говорим этому пользователю: "Ты теперь Хост!"
            socket.emit('you-are-host');
            // Говорим всем остальным: "Хост занят!"
            socket.broadcast.emit('host-status', { hasHost: true });
        } else {
            // Если место занято (на всякий случай)
            socket.emit('host-status', { hasHost: true });
        }
    });

    socket.on('new-song', (trackName) => {
        const songBlock = {
            id: Date.now(),
            name: trackName
        };
        queue.push(songBlock);
        io.emit('update-queue', queue);
    });

    socket.on('delete-song', (songId) => {
        queue = queue.filter(song => song.id !== songId);
        io.emit('update-queue', queue);
    });

    socket.on('search', async (query) => {
        console.log('Ищем:', query);
        try {
            const r = await ytSearch(query);
            const videos = r.videos.slice(0, 5);
            socket.emit('search-results', videos);
        } catch (e) {
            console.error(e);
        }
    });

    socket.on('disconnect', () => {
        connectedUsers--;
        io.emit('users-count', connectedUsers);

        // Если ушел ХОСТ
        if (socket.id === hostSocketId) {
            console.log('Хост ушел!');
            hostSocketId = null;
            // Кричим всем: "Место свободно!"
            io.emit('host-status', { hasHost: false });
        }
    })
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер работает на порту ${PORT}`);
});