const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// MySQL connection configuration
const dbConfig = {
    host: 'localhost',
    port: 5231,
    user: 'dbuser',
    password: 'MyPassword123$',
    database: 'messaging_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let db;

// Initialize database connection
async function initDatabase() {
    try {
        db = await mysql.createPool(dbConfig);
        console.log('Connected to MySQL database');
        
        // Create tables if they don't exist
        await createTables();
    } catch (error) {
        console.error('Database connection failed:', error);
        console.log('Running in demo mode without database');
    }
}

async function createTables() {
    try {
        // Users table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                username VARCHAR(255) UNIQUE NOT NULL,
                avatar VARCHAR(10),
                status ENUM('Online', 'Away', 'DoNotDisturb', 'Offline') DEFAULT 'Offline',
                last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Messages table
        await db.execute(`
            CREATE TABLE IF NOT EXISTS messages (
                id INT PRIMARY KEY AUTO_INCREMENT,
                sender_id INT,
                receiver_id INT,
                content TEXT NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        console.log('Database tables created successfully');
    } catch (error) {
        console.error('Error creating tables:', error);
    }
}

// In-memory storage for demo purposes (fallback when DB is not available)
let connectedUsers = new Map();
let messages = [];

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Handle user authentication
    socket.on('authenticate', async (userData) => {
        try {
            const { userId, username, avatar } = userData;
            
            // Store user info in socket and memory
            socket.userId = userId;
            socket.username = username;
            socket.avatar = avatar;
            
            const user = {
                id: userId,
                username: username,
                avatar: avatar,
                status: 'Online',
                socketId: socket.id
            };

            connectedUsers.set(userId, user);

            // If database is available, update user status
            if (db) {
                try {
                    await db.execute(
                        'INSERT INTO users (id, username, avatar, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?, last_seen = NOW()',
                        [userId, username, avatar, 'Online', 'Online']
                    );
                } catch (dbError) {
                    console.error('Database error during authentication:', dbError);
                }
            }

            // Send current user list to the new user
            const userList = Array.from(connectedUsers.values())
                .filter(u => u.id !== userId)
                .map(u => ({ id: u.id, username: u.username, avatar: u.avatar, status: u.status }));
            
            socket.emit('user_list', userList);

            // Notify other users about the new user
            socket.broadcast.emit('user_joined', {
                id: userId,
                username: username,
                avatar: avatar,
                status: 'Online'
            });

            console.log(`User authenticated: ${username} (ID: ${userId})`);
        } catch (error) {
            console.error('Authentication error:', error);
            socket.emit('error', { message: 'Authentication failed' });
        }
    });

    // Handle message sending
    socket.on('send_message', async (messageData) => {
        try {
            const { senderId, senderName, receiverId, content, timestamp } = messageData;

            // Store message in memory
            const message = {
                id: messages.length + 1,
                senderId,
                senderName,
                receiverId,
                content,
                timestamp: timestamp || new Date().toISOString()
            };
            messages.push(message);

            // If database is available, store the message
            if (db) {
                try {
                    await db.execute(
                        'INSERT INTO messages (sender_id, receiver_id, content, timestamp) VALUES (?, ?, ?, ?)',
                        [senderId, receiverId, content, new Date(timestamp)]
                    );
                } catch (dbError) {
                    console.error('Database error storing message:', dbError);
                }
            }

            // Find the receiver's socket
            const receiver = Array.from(connectedUsers.values()).find(u => u.id === receiverId);
            if (receiver) {
                const receiverSocket = io.sockets.sockets.get(receiver.socketId);
                if (receiverSocket) {
                    receiverSocket.emit('message', message);
                }
            }

            console.log(`Message from ${senderName} to user ${receiverId}: ${content}`);
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    });

    // Handle status changes
    socket.on('change_status', async (statusData) => {
        try {
            const { userId, status } = statusData;
            
            if (connectedUsers.has(userId)) {
                connectedUsers.get(userId).status = status;

                // Update database if available
                if (db) {
                    try {
                        await db.execute(
                            'UPDATE users SET status = ? WHERE id = ?',
                            [status, userId]
                        );
                    } catch (dbError) {
                        console.error('Database error updating status:', dbError);
                    }
                }

                // Notify all users about the status change
                io.emit('user_status_changed', { userId, status });
                console.log(`User ${userId} status changed to ${status}`);
            }
        } catch (error) {
            console.error('Error changing status:', error);
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        try {
            if (socket.userId) {
                connectedUsers.delete(socket.userId);

                // Update database if available
                if (db) {
                    try {
                        await db.execute(
                            'UPDATE users SET status = ?, last_seen = NOW() WHERE id = ?',
                            ['Offline', socket.userId]
                        );
                    } catch (dbError) {
                        console.error('Database error during disconnect:', dbError);
                    }
                }

                // Notify other users
                socket.broadcast.emit('user_left', socket.userId);
                console.log(`User disconnected: ${socket.username} (ID: ${socket.userId})`);
            }
        } catch (error) {
            console.error('Error during disconnect:', error);
        }
    });
});

// REST API endpoints (for future web interface or additional features)
app.get('/api/users', async (req, res) => {
    try {
        if (db) {
            const [rows] = await db.execute('SELECT id, username, avatar, status, last_seen FROM users ORDER BY username');
            res.json(rows);
        } else {
            res.json(Array.from(connectedUsers.values()));
        }
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.get('/api/messages/:userId1/:userId2', async (req, res) => {
    try {
        const { userId1, userId2 } = req.params;
        
        if (db) {
            const [rows] = await db.execute(
                `SELECT m.*, u1.username as sender_name, u2.username as receiver_name 
                 FROM messages m 
                 JOIN users u1 ON m.sender_id = u1.id 
                 JOIN users u2 ON m.receiver_id = u2.id 
                 WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
                 ORDER BY m.timestamp`,
                [userId1, userId2, userId2, userId1]
            );
            res.json(rows);
        } else {
            const conversationMessages = messages.filter(m => 
                (m.senderId == userId1 && m.receiverId == userId2) || 
                (m.senderId == userId2 && m.receiverId == userId1)
            );
            res.json(conversationMessages);
        }
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;

initDatabase().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Messaging server running on port ${PORT}`);
        console.log(`📡 Socket.IO server ready for connections`);
        console.log(`🗄️  Database: ${db ? 'Connected to MySQL' : 'Running in demo mode'}`);
        console.log(`\n💡 To connect your C# app, make sure the server URL is: http://localhost:${PORT}`);
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Shutting down server...');
    if (db) {
        await db.end();
    }
    server.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});
