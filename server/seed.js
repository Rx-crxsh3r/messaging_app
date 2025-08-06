const mysql = require('mysql2/promise');

// Database configuration (same as server.js)
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

async function seedDatabase() {
    let db;
    
    try {
        console.log('🌱 Starting database seeding...');
        
        // Connect to database
        db = await mysql.createPool(dbConfig);
        console.log('✅ Connected to MySQL database');

        // Create tables if they don't exist
        await createTables(db);

        // Insert test users
        const users = [
            { id: 1, username: 'alice_wonder', avatar: '🦄', status: 'Online' },
            { id: 2, username: 'bob_builder', avatar: '🔨', status: 'Online' },
            { id: 3, username: 'charlie_cat', avatar: '🐱', status: 'Away' },
            { id: 4, username: 'diana_dragon', avatar: '🐉', status: 'Offline' }
        ];

        for (const user of users) {
            await db.execute(
                `INSERT INTO users (id, username, avatar, status, created_at) 
                 VALUES (?, ?, ?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE 
                 username = VALUES(username), 
                 avatar = VALUES(avatar), 
                 status = VALUES(status)`,
                [user.id, user.username, user.avatar, user.status]
            );
        }

        console.log('✅ Test users inserted successfully');

        // Insert sample messages
        const messages = [
            { senderId: 1, receiverId: 2, content: 'Hey Bob! How are you doing?' },
            { senderId: 2, receiverId: 1, content: 'Hi Alice! I\'m doing great, thanks for asking!' },
            { senderId: 1, receiverId: 2, content: 'That\'s awesome! Want to chat more later?' },
            { senderId: 3, receiverId: 1, content: 'Hi Alice! Charlie here 🐱' },
            { senderId: 1, receiverId: 3, content: 'Hey Charlie! Nice to see you online!' }
        ];

        for (const message of messages) {
            await db.execute(
                'INSERT INTO messages (sender_id, receiver_id, content, timestamp) VALUES (?, ?, ?, NOW())',
                [message.senderId, message.receiverId, message.content]
            );
        }

        console.log('✅ Sample messages inserted successfully');

        // Check results
        const [userCount] = await db.execute('SELECT COUNT(*) as count FROM users');
        const [messageCount] = await db.execute('SELECT COUNT(*) as count FROM messages');

        console.log(`\n🎉 Seeding completed successfully!`);
        console.log(`👥 Users in database: ${userCount[0].count}`);
        console.log(`💬 Messages in database: ${messageCount[0].count}`);
        
        console.log('\n📋 Test user credentials for your C# app:');
        console.log('Username: alice_wonder (any password - create account first)');
        console.log('Username: bob_builder (any password - create account first)');
        console.log('Username: charlie_cat (any password - create account first)');
        console.log('Username: diana_dragon (any password - create account first)');

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    } finally {
        if (db) {
            await db.end();
            console.log('\n✅ Database connection closed');
        }
    }
}

async function createTables(db) {
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

        console.log('✅ Database tables created/verified');
    } catch (error) {
        console.error('❌ Error creating tables:', error);
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    seedDatabase();
}

module.exports = { seedDatabase };
